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

struct AppState {
    token: HeaderValue,
    secret: String,
    client: reqwest::Client,
    /// SHA-256 hash (base64url) of AUTH_TOKEN. None disables authentication.
    auth_hash: Option<String>,
    /// True when a webhook URL is configured, so the frontend opens a WebSocket.
    realtime: bool,
    /// Broadcast channel fanning webhook events out to all WebSocket clients.
    events: broadcast::Sender<String>,
    /// Short-lived cache of device-status responses, keyed by deviceId.
    status_cache: Mutex<HashMap<String, CacheEntry>>,
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
    let Some(expected) = &state.auth_hash else {
        return error_response(StatusCode::NOT_FOUND);
    };
    if !eq_hashed(&hash_token(body.trim()), expected) {
        // Delay on failure to slow down brute-force attempts
        tokio::time::sleep(Duration::from_millis(500)).await;
        return error_response(StatusCode::UNAUTHORIZED);
    }
    let cookie = format!("auth={expected}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax");
    (
        StatusCode::NO_CONTENT,
        [(
            SET_COOKIE,
            HeaderValue::from_str(&cookie).expect("cookie is valid header"),
        )],
    )
        .into_response()
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
fn auth_headers(state: &AppState) -> HeaderMap {
    let t = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .expect("system clock before UNIX epoch")
        .as_millis()
        .to_string();
    let nonce = uuid::Uuid::new_v4().to_string();

    let mut mac = Hmac::<Sha256>::new_from_slice(state.secret.as_bytes())
        .expect("HMAC-SHA256 accepts any key length");
    mac.update(format!("{}{}{}", state.token.to_str().unwrap_or(""), t, nonce).as_bytes());
    let sign = STANDARD.encode(mac.finalize().into_bytes());

    let mut headers = HeaderMap::with_capacity(5);
    headers.insert("Authorization", state.token.clone());
    headers.insert(
        "sign",
        HeaderValue::from_str(&sign).expect("base64 is valid header"),
    );
    headers.insert(
        "t",
        HeaderValue::from_str(&t).expect("timestamp is valid header"),
    );
    headers.insert(
        "nonce",
        HeaderValue::from_str(&nonce).expect("uuid is valid header"),
    );
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf8"),
    );
    headers
}

/// If this GET targets `/v1.1/devices/{id}/status`, return its deviceId so the
/// response can be served from / stored in the short-lived status cache. `path`
/// is the upstream path (with the `/api` prefix already stripped); any query
/// string is ignored.
fn status_cache_key(method: &Method, path: &str) -> Option<String> {
    if method != Method::GET {
        return None;
    }
    let path = path.split('?').next().unwrap_or(path);
    path.strip_prefix("/v1.1/devices/")
        .and_then(|s| s.strip_suffix("/status"))
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

    let cache_key = if state.cache_ttl.is_zero() {
        None
    } else {
        status_cache_key(&parts.method, upstream_path)
    };

    // Serve a fresh cached status without touching the upstream API.
    if let Some(key) = &cache_key {
        let hit = state
            .status_cache
            .lock()
            .expect("status_cache lock poisoned")
            .get(key)
            .filter(|e| e.fetched.elapsed() < state.cache_ttl)
            .map(|e| e.body.clone());
        if let Some(body) = hit {
            return (StatusCode::OK, [(CONTENT_TYPE, JSON_CT)], body).into_response();
        }
    }

    let body_bytes = match axum::body::to_bytes(body, MAX_BODY_BYTES).await {
        Ok(b) => b,
        Err(_) => return error_response(StatusCode::BAD_REQUEST),
    };

    let mut rb = state
        .client
        .request(parts.method, &url)
        .headers(auth_headers(&state));
    if !body_bytes.is_empty() {
        rb = rb.body(body_bytes);
    }

    match rb.send().await {
        Ok(resp) => {
            let status = resp.status();
            match resp.bytes().await {
                Ok(bytes) => {
                    if let Some(key) = cache_key
                        && status == StatusCode::OK
                        && body_status_ok(&bytes)
                    {
                        state
                            .status_cache
                            .lock()
                            .expect("status_cache lock poisoned")
                            .insert(
                                key,
                                CacheEntry {
                                    fetched: Instant::now(),
                                    body: bytes.to_vec(),
                                },
                            );
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
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
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
        state
            .status_cache
            .lock()
            .expect("status_cache lock poisoned")
            .remove(mac);
    }
    if let Ok(text) = serde_json::to_string(context) {
        // Ignore the error when no clients are currently connected.
        let _ = state.events.send(text);
    }
    StatusCode::OK
}

/// Extract the path SwitchBot should POST to from a full webhook URL,
/// falling back to `/webhook` when the URL carries no explicit path.
fn webhook_path(url: &str) -> String {
    let after_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    match after_scheme.find('/') {
        Some(i) => {
            let path = after_scheme[i..]
                .split(['?', '#'])
                .next()
                .unwrap_or("/")
                .trim_end_matches('/');
            if path.is_empty() {
                "/webhook".to_string()
            } else {
                path.to_string()
            }
        }
        None => "/webhook".to_string(),
    }
}

/// POST a JSON body to the SwitchBot API and return its `statusCode` field.
async fn post_switchbot(state: &AppState, path: &str, body: String) -> Option<u64> {
    let url = format!("{SWITCHBOT_API}{path}");
    let resp = state
        .client
        .post(&url)
        .headers(auth_headers(state))
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
    let setup = format!(r#"{{"action":"setupWebhook","url":"{url}","deviceList":"ALL"}}"#);
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
    let update =
        format!(r#"{{"action":"updateWebhook","config":{{"url":"{url}","enable":true}}}}"#);
    match post_switchbot(state, "/v1.1/webhook/updateWebhook", update).await {
        Some(100) => println!("Webhook updated: {url}"),
        Some(code) => eprintln!("updateWebhook returned statusCode {code}"),
        None => eprintln!("Webhook update request failed"),
    }
}

async fn unregister_webhook(state: &AppState, url: &str) {
    let body = format!(r#"{{"action":"deleteWebhook","url":"{url}"}}"#);
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
    let cache_ttl = Duration::from_secs(
        env::var("STATUS_CACHE_TTL")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_CACHE_TTL_SECS),
    );
    let webhook_url = env::var("WEBHOOK_URL").ok().filter(|u| !u.is_empty());

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
        realtime: webhook_url.is_some(),
        events,
        status_cache: Mutex::new(HashMap::new()),
        cache_ttl,
    });

    let mut app = Router::new()
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/config", get(config))
        .route("/ws", get(ws_handler));
    if let Some(url) = &webhook_url {
        app = app.route(&webhook_path(url), post(webhook));
    }
    let app = app
        .with_state(state.clone())
        .nest_service("/api/", any(api_proxy).with_state(state.clone()))
        .nest_service("/locales", ServeDir::new("locales"))
        .fallback_service(ServeDir::new("dist").fallback(ServeFile::new("dist/index.html")));

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
    match &webhook_url {
        Some(url) => println!("  Realtime → webhook {} → WebSocket", webhook_path(url)),
        None => println!("  Realtime → disabled (set WEBHOOK_URL to enable)"),
    }
    println!("══════════════════════════════════════════");

    // Register the webhook in the background so binding is never delayed by it.
    if let Some(url) = &webhook_url {
        let state = state.clone();
        let url = url.clone();
        tokio::spawn(async move { register_webhook(&state, &url).await });
    }

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|e| die(format!("failed to bind {addr}: {e}")));
    println!("Listening on {addr}");

    let shutdown = async {
        let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to listen for SIGTERM");
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

    if let Some(url) = &webhook_url {
        unregister_webhook(&state, url).await;
    }
}
