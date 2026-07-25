use axum::{
    Router,
    body::{Body, Bytes},
    extract::{
        Request, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{
        HeaderMap, HeaderValue, Method, StatusCode,
        header::{CONTENT_TYPE, COOKIE, SET_COOKIE, WWW_AUTHENTICATE},
    },
    response::{IntoResponse, Response},
    routing::{any, get, post},
};
use base64::{
    Engine,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    env,
    net::SocketAddr,
    path::Path,
    process,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime},
};
use tokio::sync::broadcast;
use tower_http::services::{ServeDir, ServeFile};

const VERSION: &str = concat!(
    "v",
    env!("PKG_VERSION"),
    "-",
    env!("GIT_HASH"),
    " (",
    env!("BUILD_DATE"),
    ")",
);

const SWITCHBOT_API: &str = "https://api.switch-bot.com";
const JSON_CT: &str = "application/json";
const MAX_BODY_BYTES: usize = 1024 * 1024;
const DEFAULT_CACHE_TTL_SECS: u64 = 5;
/// Directory the built frontend is served from.
const DIST_DIR: &str = "dist";
/// Top-level paths the app router owns, including everything nested under them.
/// `WEBHOOK_URL` may not point at any of these; keep in step with `main`.
const RESERVED_PATHS: [&str; 5] = ["/api", "/auth", "/config", "/locales", "/ws"];

/// Print an error and exit when a required configuration value is missing.
fn die(msg: impl std::fmt::Display) -> ! {
    eprintln!("Error: {msg}");
    process::exit(1);
}

/// A cached device-status response body with the instant it was fetched.
struct CacheEntry {
    fetched: Instant,
    body: Vec<u8>,
}

/// Cache slot for one device. The generation outlives the body: it keeps
/// counting invalidations so a response fetched before one can be recognized
/// as stale even though the body it would replace is already gone.
#[derive(Default)]
struct Slot {
    entry: Option<CacheEntry>,
    generation: u64,
}

struct AppState {
    token: HeaderValue,
    secret: String,
    client: reqwest::Client,
    /// SHA-256 hash (base64url) of AUTH_TOKEN. None disables authentication.
    auth_hash: Option<String>,
    /// Set-Cookie value issued on a successful login. Built once at startup so
    /// the request path never has to re-validate a constant string.
    auth_cookie: Option<HeaderValue>,
    /// True when a webhook URL is configured, so the frontend opens a WebSocket.
    realtime: bool,
    /// Broadcast channel fanning webhook events out to all WebSocket clients.
    events: broadcast::Sender<String>,
    /// Short-lived cache of device-status responses, keyed by deviceId.
    status_cache: Mutex<HashMap<String, Slot>>,
    /// How long a cached status stays fresh. Zero disables caching.
    cache_ttl: Duration,
}

fn error_response(status: StatusCode) -> Response {
    let code = status.as_u16();
    let body = format!(r#"{{"statusCode":{code},"message":"{status}"}}"#);
    (status, [(CONTENT_TYPE, JSON_CT)], body).into_response()
}

fn hash_token(token: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(token.as_bytes()))
}

/// Re-hash both sides before comparing to prevent timing side-channel attacks.
fn eq_hashed(a: &str, b: &str) -> bool {
    Sha256::digest(a.as_bytes()) == Sha256::digest(b.as_bytes())
}

fn is_authorized(state: &AppState, headers: &HeaderMap) -> bool {
    let Some(expected) = &state.auth_hash else {
        return true;
    };
    headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|s| s.split(';'))
        .filter_map(|kv| kv.trim().strip_prefix("auth="))
        .any(|v| eq_hashed(v, expected))
}

/// Verify the token against AUTH_TOKEN and issue an auth cookie on match.
/// The cookie stores the hash, not the raw token.
async fn login(State(state): State<Arc<AppState>>, body: String) -> Response {
    let (Some(expected), Some(cookie)) = (&state.auth_hash, &state.auth_cookie) else {
        return error_response(StatusCode::NOT_FOUND);
    };
    if !eq_hashed(&hash_token(body.trim()), expected) {
        // Delay on failure to slow down brute-force attempts
        tokio::time::sleep(Duration::from_millis(500)).await;
        return error_response(StatusCode::UNAUTHORIZED);
    }
    (StatusCode::NO_CONTENT, [(SET_COOKIE, cookie.clone())]).into_response()
}

/// Clear the auth cookie so a shared device can end its session.
async fn logout() -> Response {
    let cookie = "auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
    (
        StatusCode::NO_CONTENT,
        [(SET_COOKIE, HeaderValue::from_static(cookie))],
    )
        .into_response()
}

/// Expose the flags the frontend needs before rendering: whether the UI
/// requires a login and whether realtime updates are available.
async fn config(State(state): State<Arc<AppState>>) -> Response {
    let body = format!(
        r#"{{"authEnabled":{},"realtime":{}}}"#,
        state.auth_hash.is_some(),
        state.realtime,
    );
    (StatusCode::OK, [(CONTENT_TYPE, JSON_CT)], body).into_response()
}

/// Build SwitchBot API v1.1 auth headers (token + HMAC-SHA256 signature).
/// None when the configured credentials cannot form valid headers — the caller
/// reports that as a failed request rather than taking the whole server down.
fn auth_headers(state: &AppState) -> Option<HeaderMap> {
    // A clock before the epoch yields t=0, which SwitchBot rejects as a stale
    // signature. That surfaces as an API error, which beats panicking here.
    let t = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string();
    let nonce = uuid::Uuid::new_v4().to_string();

    let mut mac = Hmac::<Sha256>::new_from_slice(state.secret.as_bytes()).ok()?;
    mac.update(format!("{}{}{}", state.token.to_str().ok()?, t, nonce).as_bytes());
    let sign = STANDARD.encode(mac.finalize().into_bytes());

    let mut headers = HeaderMap::with_capacity(5);
    headers.insert("Authorization", state.token.clone());
    headers.insert("sign", HeaderValue::from_str(&sign).ok()?);
    headers.insert("t", HeaderValue::from_str(&t).ok()?);
    headers.insert("nonce", HeaderValue::from_str(&nonce).ok()?);
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf8"),
    );
    Some(headers)
}

/// If this GET targets `/v1.1/devices/{id}/status`, return its deviceId so the
/// response can be served from / stored in the short-lived status cache. `path`
/// is the upstream path (with the `/api` prefix already stripped); any query
/// string is ignored.
fn status_cache_key(method: &Method, path: &str) -> Option<String> {
    if method != Method::GET {
        return None;
    }
    let path = path.split_once('?').map_or(path, |(head, _)| head);
    path.strip_prefix("/v1.1/devices/")
        .and_then(|s| s.strip_suffix("/status"))
        .filter(|id| !id.is_empty() && !id.contains('/'))
        .map(str::to_owned)
}

/// If this POST sends a device command, return the status-cache key that must
/// be invalidated after SwitchBot accepts it.
fn command_cache_key(method: &Method, path: &str) -> Option<String> {
    if method != Method::POST {
        return None;
    }
    let path = path.split_once('?').map_or(path, |(head, _)| head);
    path.strip_prefix("/v1.1/devices/")
        .and_then(|s| s.strip_suffix("/commands"))
        .filter(|id| !id.is_empty() && !id.contains('/'))
        .map(str::to_owned)
}

/// True when a SwitchBot response body reports success (statusCode 100),
/// used to avoid caching transient errors such as rate-limit responses.
fn body_status_ok(bytes: &[u8]) -> bool {
    serde_json::from_slice::<serde_json::Value>(bytes)
        .ok()
        .and_then(|v| v.get("statusCode").and_then(|s| s.as_u64()))
        == Some(100)
}

/// Result of a status-cache lookup: either a body that can be served as-is, or
/// the generation a fresh response must still match before it may be stored.
enum CacheLookup {
    Hit(Vec<u8>),
    Miss(u64),
}

/// Take the cache lock, recovering from poisoning: the guarded sections only
/// touch a HashMap, so a panic elsewhere cannot leave it half-updated, and
/// dropping status caching is not worth failing a request over.
fn lock_cache(state: &AppState) -> std::sync::MutexGuard<'_, HashMap<String, Slot>> {
    state
        .status_cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Drop the cached body and bump the generation, so any response already in
/// flight for this device is recognized as stale and refused by `store_status`.
fn invalidate_status(state: &AppState, key: &str) {
    let mut cache = lock_cache(state);
    let slot = cache.entry(key.to_string()).or_default();
    slot.generation = slot.generation.wrapping_add(1);
    slot.entry = None;
}

fn lookup_status(state: &AppState, key: &str, ttl: Duration) -> CacheLookup {
    let cache = lock_cache(state);
    let Some(slot) = cache.get(key) else {
        return CacheLookup::Miss(0);
    };
    match &slot.entry {
        Some(entry) if entry.fetched.elapsed() < ttl => CacheLookup::Hit(entry.body.clone()),
        _ => CacheLookup::Miss(slot.generation),
    }
}

/// Store a fetched status, unless the device was invalidated while the request
/// was in flight — that response predates the change and must not be cached.
fn store_status(state: &AppState, key: String, generation: u64, body: Vec<u8>) {
    let mut cache = lock_cache(state);
    let slot = cache.entry(key).or_default();
    if slot.generation == generation {
        slot.entry = Some(CacheEntry {
            fetched: Instant::now(),
            body,
        });
    }
}

async fn api_proxy(State(state): State<Arc<AppState>>, req: Request<Body>) -> Response {
    let (parts, body) = req.into_parts();
    if !is_authorized(&state, &parts.headers) {
        // Attach WWW-Authenticate only to our own auth rejection so the frontend
        // can distinguish it from an upstream SwitchBot API 401
        let mut resp = error_response(StatusCode::UNAUTHORIZED);
        resp.headers_mut()
            .insert(WWW_AUTHENTICATE, HeaderValue::from_static("Cookie"));
        return resp;
    }

    let path = parts
        .uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let upstream_path = path.strip_prefix("/api").unwrap_or(path);
    let url = format!("{SWITCHBOT_API}{upstream_path}");

    let (cache_key, invalidate_key) = if state.cache_ttl.is_zero() {
        (None, None)
    } else {
        (
            status_cache_key(&parts.method, upstream_path),
            command_cache_key(&parts.method, upstream_path),
        )
    };

    // Serve a fresh cached status without touching the upstream API. On a miss,
    // remember the generation the eventual response has to still match.
    let mut pending_store = None;
    if let Some(key) = cache_key {
        match lookup_status(&state, &key, state.cache_ttl) {
            CacheLookup::Hit(body) => {
                return (StatusCode::OK, [(CONTENT_TYPE, JSON_CT)], body).into_response();
            }
            CacheLookup::Miss(generation) => pending_store = Some((key, generation)),
        }
    }

    let body_bytes = match axum::body::to_bytes(body, MAX_BODY_BYTES).await {
        Ok(b) => b,
        Err(_) => return error_response(StatusCode::BAD_REQUEST),
    };

    let Some(headers) = auth_headers(&state) else {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR);
    };
    let mut rb = state.client.request(parts.method, &url).headers(headers);
    if !body_bytes.is_empty() {
        rb = rb.body(body_bytes);
    }

    match rb.send().await {
        Ok(resp) => {
            let status = resp.status();
            match resp.bytes().await {
                Ok(bytes) => {
                    // Transient failures (rate limits, upstream errors) must
                    // neither be cached nor treated as a state change.
                    if status == StatusCode::OK && body_status_ok(&bytes) {
                        if let Some(key) = invalidate_key {
                            invalidate_status(&state, &key);
                        }
                        if let Some((key, generation)) = pending_store {
                            store_status(&state, key, generation, bytes.to_vec());
                        }
                    }
                    (status, [(CONTENT_TYPE, JSON_CT)], bytes).into_response()
                }
                Err(_) => error_response(StatusCode::BAD_GATEWAY),
            }
        }
        Err(e) => {
            eprintln!("Proxy error: {e}");
            error_response(StatusCode::BAD_GATEWAY)
        }
    }
}

/// Upgrade an authorized request to a WebSocket that streams device events.
async fn ws_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if !is_authorized(&state, &headers) {
        return error_response(StatusCode::UNAUTHORIZED);
    }
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.events.subscribe();
    let mut ping_interval = tokio::time::interval(Duration::from_secs(30));
    ping_interval.tick().await; // consume the immediate first tick
    loop {
        tokio::select! {
            event = rx.recv() => match event {
                Ok(text) => {
                    if socket.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                // Reconnecting tells the browser to perform a full status refresh.
                Err(broadcast::error::RecvError::Lagged(_)) => break,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            client = socket.recv() => match client {
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(_)) => break,
            },
            _ = ping_interval.tick() => {
                if socket.send(Message::Ping(Vec::new().into())).await.is_err() {
                    break;
                }
            },
        }
    }
}

/// Receive a SwitchBot webhook, forward the device context to WebSocket clients
/// and drop the device's cached status so the next poll reflects the change.
async fn webhook(State(state): State<Arc<AppState>>, body: Bytes) -> StatusCode {
    let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&body) else {
        return StatusCode::BAD_REQUEST;
    };
    let Some(context) = payload.get("context") else {
        return StatusCode::NO_CONTENT;
    };
    if let Some(mac) = context.get("deviceMac").and_then(|v| v.as_str()) {
        invalidate_status(&state, mac);
    }
    if let Ok(text) = serde_json::to_string(context) {
        // Ignore the error when no clients are currently connected.
        let _ = state.events.send(text);
    }
    StatusCode::OK
}

/// Parse and canonicalize the public webhook URL once so the registered URL
/// always points at the same path as the local route.
fn webhook_config(input: &str, dist: &Path) -> Result<(String, String), String> {
    let mut url = reqwest::Url::parse(input).map_err(|e| format!("invalid WEBHOOK_URL: {e}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("WEBHOOK_URL must use http or https".to_string());
    }
    if url.fragment().is_some() {
        return Err("WEBHOOK_URL must not contain a fragment".to_string());
    }

    let path = url.path().trim_end_matches('/');
    let path = if path.is_empty() { "/webhook" } else { path };
    let reserved = RESERVED_PATHS.iter().any(|r| {
        path == *r
            || path
                .strip_prefix(r)
                .is_some_and(|rest| rest.starts_with('/'))
    });
    if reserved {
        return Err(format!(
            "WEBHOOK_URL path {path} conflicts with an application route"
        ));
    }
    // A path with only a POST route answers GETs with 405 instead of falling
    // through to the static file server, so refuse to shadow a built asset.
    if dist.join(path.trim_start_matches('/')).exists() {
        return Err(format!(
            "WEBHOOK_URL path {path} conflicts with a static asset"
        ));
    }
    let path = path.to_string();
    url.set_path(&path);
    Ok((url.to_string(), path))
}

/// POST a JSON body to the SwitchBot API and return its `statusCode` field.
async fn post_switchbot(state: &AppState, path: &str, body: serde_json::Value) -> Option<u64> {
    let url = format!("{SWITCHBOT_API}{path}");
    let body = serde_json::to_vec(&body).ok()?;
    let resp = state
        .client
        .post(&url)
        .headers(auth_headers(state)?)
        .body(body)
        .send()
        .await
        .ok()?;
    let text = resp.text().await.ok()?;
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()?
        .get("statusCode")
        .and_then(|v| v.as_u64())
}

/// Register (or, if one already exists, update) the SwitchBot webhook so state
/// changes are pushed to this server. Best-effort: failures are only logged.
async fn register_webhook(state: &AppState, url: &str) {
    let setup = serde_json::json!({
        "action": "setupWebhook",
        "url": url,
        "deviceList": "ALL",
    });
    match post_switchbot(state, "/v1.1/webhook/setupWebhook", setup).await {
        Some(100) => {
            println!("Webhook registered: {url}");
            return;
        }
        Some(code) => {
            // A webhook is likely already configured; overwrite it with ours.
            eprintln!("setupWebhook returned statusCode {code}; trying updateWebhook");
        }
        None => {
            eprintln!("Webhook registration request failed");
            return;
        }
    }
    let update = serde_json::json!({
        "action": "updateWebhook",
        "config": { "url": url, "enable": true },
    });
    match post_switchbot(state, "/v1.1/webhook/updateWebhook", update).await {
        Some(100) => println!("Webhook updated: {url}"),
        Some(code) => eprintln!("updateWebhook returned statusCode {code}"),
        None => eprintln!("Webhook update request failed"),
    }
}

/// Deregister the webhook on shutdown so SwitchBot stops POSTing to a URL that
/// no longer has a listener. Best-effort: failures are only logged.
async fn unregister_webhook(state: &AppState, url: &str) {
    let body = serde_json::json!({ "action": "deleteWebhook", "url": url });
    match post_switchbot(state, "/v1.1/webhook/deleteWebhook", body).await {
        Some(100) => println!("Webhook unregistered: {url}"),
        Some(code) => eprintln!("deleteWebhook returned statusCode {code}"),
        None => eprintln!("Webhook unregistration request failed"),
    }
}

#[tokio::main]
async fn main() {
    // Load .env if present; ignore if missing
    let dotenv_loaded = dotenvy::dotenv().is_ok();

    let token = env::var("SWITCHBOT_TOKEN").unwrap_or_else(|_| die("SWITCHBOT_TOKEN must be set"));
    let token = HeaderValue::from_str(&token)
        .unwrap_or_else(|_| die("SWITCHBOT_TOKEN contains invalid characters"));
    let secret =
        env::var("SWITCHBOT_SECRET").unwrap_or_else(|_| die("SWITCHBOT_SECRET must be set"));
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);
    let auth_hash = env::var("AUTH_TOKEN")
        .ok()
        .filter(|t| !t.is_empty())
        .map(|t| hash_token(&t));
    let auth_enabled = auth_hash.is_some();
    let auth_cookie = auth_hash.as_ref().map(|hash| {
        let cookie = format!("auth={hash}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax");
        HeaderValue::from_str(&cookie)
            .unwrap_or_else(|e| die(format!("failed to build the auth cookie: {e}")))
    });
    let cache_ttl = Duration::from_secs(
        env::var("STATUS_CACHE_TTL")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_CACHE_TTL_SECS),
    );
    let webhook_settings = env::var("WEBHOOK_URL")
        .ok()
        .filter(|u| !u.is_empty())
        .map(|url| webhook_config(&url, Path::new(DIST_DIR)).unwrap_or_else(|e| die(e)));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap_or_else(|e| die(format!("failed to build HTTP client: {e}")));

    let (events, _) = broadcast::channel::<String>(64);
    let state = Arc::new(AppState {
        token,
        secret,
        client,
        auth_hash,
        auth_cookie,
        realtime: webhook_settings.is_some(),
        events,
        status_cache: Mutex::new(HashMap::new()),
        cache_ttl,
    });

    let mut app = Router::new()
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/config", get(config))
        .route("/ws", get(ws_handler));
    if let Some((_, path)) = &webhook_settings {
        app = app.route(path, post(webhook));
    }
    let app = app
        .with_state(state.clone())
        .nest_service("/api/", any(api_proxy).with_state(state.clone()))
        .nest_service("/locales", ServeDir::new("locales"))
        .fallback_service(
            ServeDir::new(DIST_DIR).fallback(ServeFile::new(format!("{DIST_DIR}/index.html"))),
        );

    println!("══════════════════════════════════════════");
    println!("  SwitchBot WebUI {VERSION}");
    if dotenv_loaded {
        println!("  Config   → loaded .env");
    }
    println!("  Web UI   → http://localhost:{port}");
    if auth_enabled {
        println!("  Auth     → AUTH_TOKEN is set");
    } else {
        println!("  Auth     → disabled (set AUTH_TOKEN to enable)");
    }
    if cache_ttl.is_zero() {
        println!("  Cache    → disabled");
    } else {
        println!("  Cache    → status cached for {}s", cache_ttl.as_secs());
    }
    match &webhook_settings {
        Some((_, path)) => println!("  Realtime → webhook {path} → WebSocket"),
        None => println!("  Realtime → disabled (set WEBHOOK_URL to enable)"),
    }
    println!("══════════════════════════════════════════");

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|e| die(format!("failed to bind {addr}: {e}")));
    println!("Listening on {addr}");

    // Bind first, then register in the background so SwitchBot cannot call an
    // endpoint that is not listening yet.
    if let Some((url, _)) = &webhook_settings {
        let state = state.clone();
        let url = url.clone();
        tokio::spawn(async move { register_webhook(&state, &url).await });
    }

    let shutdown = async {
        let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .unwrap_or_else(|e| die(format!("failed to listen for SIGTERM: {e}")));
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = sigterm.recv() => {}
        }
        println!("\nShutting down...");
    };
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .await
        .unwrap_or_else(|e| die(format!("server error: {e}")));

    if let Some((url, _)) = &webhook_settings {
        unregister_webhook(&state, url).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_only_device_status_gets() {
        assert_eq!(
            status_cache_key(&Method::GET, "/v1.1/devices/device-1/status?x=1"),
            Some("device-1".to_string())
        );
        assert_eq!(
            status_cache_key(&Method::POST, "/v1.1/devices/device-1/status"),
            None
        );
        assert_eq!(
            status_cache_key(&Method::GET, "/v1.1/devices/a/b/status"),
            None
        );
    }

    #[test]
    fn recognizes_only_device_command_posts() {
        assert_eq!(
            command_cache_key(&Method::POST, "/v1.1/devices/device-1/commands"),
            Some("device-1".to_string())
        );
        assert_eq!(
            command_cache_key(&Method::GET, "/v1.1/devices/device-1/commands"),
            None
        );
    }

    /// A directory that is guaranteed not to contain any static asset, so the
    /// route checks are exercised without depending on a frontend build.
    fn no_dist() -> &'static Path {
        Path::new("target/webhook-config-test-missing-dist")
    }

    #[test]
    fn canonicalizes_webhook_url_and_path_together() {
        assert_eq!(
            webhook_config("https://example.com", no_dist()).unwrap(),
            (
                "https://example.com/webhook".to_string(),
                "/webhook".to_string()
            )
        );
        assert_eq!(
            webhook_config("https://example.com/events/", no_dist()).unwrap(),
            (
                "https://example.com/events".to_string(),
                "/events".to_string()
            )
        );
        assert!(webhook_config("https://example.com/api/events", no_dist()).is_err());
        assert!(webhook_config("https://example.com/locales", no_dist()).is_err());
    }

    #[test]
    fn rejects_webhook_paths_that_shadow_static_assets() {
        let dist = env::temp_dir().join(format!("switchbot-webui-dist-{}", process::id()));
        std::fs::create_dir_all(dist.join("assets")).expect("failed to create test dist");
        std::fs::write(dist.join("index.html"), "").expect("failed to write test asset");

        assert!(webhook_config("https://example.com/index.html", &dist).is_err());
        assert!(webhook_config("https://example.com/assets", &dist).is_err());
        assert!(webhook_config("https://example.com/webhook", &dist).is_ok());

        std::fs::remove_dir_all(&dist).ok();
    }
}
