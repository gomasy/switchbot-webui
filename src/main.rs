use axum::{
    Router,
    body::{Body, Bytes},
    extract::{
        Request, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{
        HeaderMap, HeaderValue, Method, StatusCode,
        header::{CONTENT_TYPE, COOKIE, HOST, ORIGIN, SET_COOKIE, WWW_AUTHENTICATE},
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
/// Upper bound on cached devices. Webhook payloads are unauthenticated, so a
/// forged deviceMac must not be able to grow the cache without limit.
const MAX_CACHE_ENTRIES: usize = 512;
/// How long a session stays usable. Sessions are kept in memory only, so a
/// restart ends them as well.
const SESSION_TTL: Duration = Duration::from_secs(30 * 24 * 60 * 60);
/// Delay after a failed login, doubled per consecutive failure. Attempts are
/// serialized, so this is the real cost of a guess.
const LOGIN_BASE_DELAY: Duration = Duration::from_millis(500);
const LOGIN_MAX_DELAY: Duration = Duration::from_secs(30);
/// Directory the built frontend is served from.
const DIST_DIR: &str = "dist";
/// Top-level paths the app router owns, including everything nested under them.
/// `WEBHOOK_URL` may not point at any of these; keep in step with `main`.
const RESERVED_PATHS: &[&str] = &["/api", "/auth", "/config", "/locales", "/ws"];

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

/// SHA-256 of the value carried in an auth cookie. Only the digest is stored,
/// so nothing in memory can be replayed as a session cookie.
type SessionId = [u8; 32];

/// What authorizing a request established about the caller.
enum Session {
    /// Authentication is disabled; there is nothing to revoke.
    Open,
    /// Authenticated by a session that a logout can end.
    Active(SessionId),
}

/// Live login sessions and their expiry, keyed by the digest of the cookie
/// value each client holds. In memory only, so a restart logs everyone out.
#[derive(Default)]
struct Sessions(Mutex<HashMap<SessionId, Instant>>);

impl Sessions {
    /// True when this id names a session that has not expired yet. Reads only:
    /// entries are reaped by `start`, so the request path never pays for a
    /// scan of every session just to answer one membership question.
    fn is_live(&self, id: &SessionId) -> bool {
        lock(&self.0)
            .get(id)
            .is_some_and(|expires| *expires > Instant::now())
    }

    /// Register a session and drop any that have expired. Logging in is the
    /// only way entries are added, so pruning here bounds the map.
    fn start(&self, id: SessionId) {
        let now = Instant::now();
        let mut sessions = lock(&self.0);
        sessions.retain(|_, expires| *expires > now);
        sessions.insert(id, now + SESSION_TTL);
    }

    fn revoke(&self, ids: impl Iterator<Item = SessionId>) {
        let mut sessions = lock(&self.0);
        for id in ids {
            sessions.remove(&id);
        }
    }
}

struct AppState {
    token: HeaderValue,
    secret: String,
    client: reqwest::Client,
    /// SHA-256 hash (base64url) of AUTH_TOKEN. None disables authentication.
    auth_hash: Option<String>,
    sessions: Sessions,
    /// Consecutive failed logins, behind an async mutex so attempts are handled
    /// one at a time and cannot be guessed in parallel.
    login_gate: tokio::sync::Mutex<u32>,
    /// True when a webhook URL is configured, so the frontend opens a WebSocket.
    realtime: bool,
    /// Broadcast channel fanning webhook events out to all WebSocket clients.
    events: broadcast::Sender<String>,
    /// Short-lived cache of device-status responses, keyed by deviceId.
    status_cache: Mutex<HashMap<String, Slot>>,
    /// How long a cached status stays fresh. Zero disables caching.
    cache_ttl: Duration,
}

/// Every response this server writes itself is JSON, so that header is set in
/// exactly one place.
fn json_response(status: StatusCode, body: impl Into<Body>) -> Response {
    (status, [(CONTENT_TYPE, JSON_CT)], body.into()).into_response()
}

fn error_response(status: StatusCode) -> Response {
    let code = status.as_u16();
    json_response(
        status,
        format!(r#"{{"statusCode":{code},"message":"{status}"}}"#),
    )
}

fn hash_token(token: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(token.as_bytes()))
}

/// Re-hash both sides before comparing to prevent timing side-channel attacks.
fn eq_hashed(a: &str, b: &str) -> bool {
    Sha256::digest(a.as_bytes()) == Sha256::digest(b.as_bytes())
}

fn session_id(cookie_value: &str) -> SessionId {
    Sha256::digest(cookie_value.as_bytes()).into()
}

/// The value of every `auth=` cookie on the request.
fn auth_cookies(headers: &HeaderMap) -> impl Iterator<Item = &str> {
    headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|s| s.split(';'))
        .filter_map(|kv| kv.trim().strip_prefix("auth="))
}

/// Establish who the caller is. None when authentication is enabled and the
/// request carries no live session cookie.
fn authorize(state: &AppState, headers: &HeaderMap) -> Option<Session> {
    if state.auth_hash.is_none() {
        return Some(Session::Open);
    }
    auth_cookies(headers)
        .map(session_id)
        .find(|id| state.sessions.is_live(id))
        .map(Session::Active)
}

/// Mint a session cookie and record its digest. None when the platform RNG
/// fails, which the caller reports as a server error rather than handing out a
/// predictable session.
fn start_session(sessions: &Sessions) -> Option<HeaderValue> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).ok()?;
    let value = URL_SAFE_NO_PAD.encode(bytes);
    let max_age = SESSION_TTL.as_secs();
    let cookie = format!("auth={value}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax");
    let cookie = HeaderValue::from_str(&cookie).ok()?;

    sessions.start(session_id(&value));
    Some(cookie)
}

/// True unless a browser marked this request as cross-site. Browsers set
/// `Sec-Fetch-Site` on every fetch and a page cannot forge it, so it is a
/// reliable CSRF guard. Clients that send neither header (curl, scripts) are
/// allowed through: they carry no ambient cookie for an attacker to borrow.
fn origin_matches_host(headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(ORIGIN).and_then(|v| v.to_str().ok()) else {
        return true;
    };
    headers
        .get(HOST)
        .and_then(|v| v.to_str().ok())
        .and_then(|host| origin.split_once("://").map(|(_, rest)| rest == host))
        .unwrap_or(false)
}

fn same_origin(headers: &HeaderMap) -> bool {
    if let Some(site) = headers.get("sec-fetch-site").and_then(|v| v.to_str().ok()) {
        return matches!(site, "same-origin" | "none");
    }
    // Browsers predating Sec-Fetch-Site still send Origin on cross-site
    // requests; compare it with the host the request was addressed to.
    origin_matches_host(headers)
}

/// WebSockets are not protected by CORS, so validate both browser fetch
/// metadata and the Origin authority before accepting an upgrade.
fn websocket_origin_allowed(headers: &HeaderMap) -> bool {
    same_origin(headers) && origin_matches_host(headers)
}

/// Refuse state-changing requests a browser reports as cross-site, so no
/// handler has to remember the check and a new route cannot forget it. Reads
/// pass through: without CORS headers their responses stay unreadable anyway.
async fn reject_cross_site(req: Request<Body>, next: axum::middleware::Next) -> Response {
    if !matches!(*req.method(), Method::GET | Method::HEAD) && !same_origin(req.headers()) {
        return error_response(StatusCode::FORBIDDEN);
    }
    next.run(req).await
}

/// Verify the token against AUTH_TOKEN and start a session on match. The cookie
/// carries a fresh random value, so it can be revoked without changing
/// AUTH_TOKEN and never encodes the token itself.
async fn login(State(state): State<Arc<AppState>>, body: String) -> Response {
    let Some(expected) = &state.auth_hash else {
        return error_response(StatusCode::NOT_FOUND);
    };

    // One attempt at a time: the delay below only costs an attacker anything if
    // concurrent guesses have to queue behind it.
    let mut failures = state.login_gate.lock().await;
    if !eq_hashed(&hash_token(body.trim()), expected) {
        *failures = failures.saturating_add(1);
        let delay = LOGIN_BASE_DELAY
            .saturating_mul(1 << (*failures - 1).min(6))
            .min(LOGIN_MAX_DELAY);
        // Sleep while still holding the gate so the next attempt waits too.
        tokio::time::sleep(delay).await;
        return error_response(StatusCode::UNAUTHORIZED);
    }
    *failures = 0;
    drop(failures);

    let Some(cookie) = start_session(&state.sessions) else {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR);
    };
    (StatusCode::NO_CONTENT, [(SET_COOKIE, cookie)]).into_response()
}

/// Clear the auth cookie and drop the session server-side, so logging out on a
/// shared device also stops any other client replaying that cookie.
async fn logout(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    state
        .sessions
        .revoke(auth_cookies(&headers).map(session_id));
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
    json_response(
        StatusCode::OK,
        format!(
            r#"{{"authEnabled":{},"realtime":{}}}"#,
            state.auth_hash.is_some(),
            state.realtime,
        ),
    )
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

/// SwitchBot device identifiers are short MAC-like strings. Anything else is
/// refused so a forged webhook cannot choose arbitrary cache keys.
fn valid_device_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 32
        && key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b':' || b == b'-')
}

/// The deviceId in `/v1.1/devices/{id}{suffix}`, when `path` names exactly that
/// route with the given method. `path` is the upstream path; any query string
/// is ignored.
fn device_route_key(method: &Method, path: &str, expected: Method, suffix: &str) -> Option<String> {
    if method != expected {
        return None;
    }
    let path = path.split_once('?').map_or(path, |(head, _)| head);
    path.strip_prefix("/v1.1/devices/")
        .and_then(|s| s.strip_suffix(suffix))
        .filter(|id| valid_device_key(id))
        .map(str::to_owned)
}

/// If this GET targets a device's status, return its deviceId so the response
/// can be served from / stored in the short-lived status cache.
fn status_cache_key(method: &Method, path: &str) -> Option<String> {
    device_route_key(method, path, Method::GET, "/status")
}

/// If this POST sends a device command, return the status-cache key that must
/// be invalidated after SwitchBot accepts it.
fn command_cache_key(method: &Method, path: &str) -> Option<String> {
    device_route_key(method, path, Method::POST, "/commands")
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

/// Take a lock, recovering from poisoning: the guarded sections only touch a
/// map, so a panic elsewhere cannot leave one half-updated, and losing status
/// caching or every session is not worth failing a request over.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Whether the cache will accept this key: already tracked, or still under the
/// cap. Bounded because an unauthenticated webhook chooses some of these keys,
/// and the cheap length test comes first so the common case costs no lookup.
fn has_room(cache: &HashMap<String, Slot>, key: &str) -> bool {
    cache.len() < MAX_CACHE_ENTRIES || cache.contains_key(key)
}

/// Drop the cached body and bump the generation, so any response already in
/// flight for this device is recognized as stale and refused by `store_status`.
fn invalidate_status(state: &AppState, key: &str) {
    let mut cache = lock(&state.status_cache);
    if !has_room(&cache, key) {
        return;
    }
    let slot = cache.entry(key.to_string()).or_default();
    slot.generation = slot.generation.wrapping_add(1);
    slot.entry = None;
}

fn lookup_status(state: &AppState, key: &str, ttl: Duration) -> CacheLookup {
    let cache = lock(&state.status_cache);
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
    let mut cache = lock(&state.status_cache);
    if !has_room(&cache, &key) {
        return;
    }
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
    if authorize(&state, &parts.headers).is_none() {
        // Attach WWW-Authenticate only to our own auth rejection so the frontend
        // can distinguish it from an upstream SwitchBot API 401
        let mut resp = error_response(StatusCode::UNAUTHORIZED);
        resp.headers_mut()
            .insert(WWW_AUTHENTICATE, HeaderValue::from_static("Cookie"));
        return resp;
    }

    // `nest_service("/api/")` has already stripped the prefix, so this is the
    // upstream path as-is. Stripping it again here would rewrite a genuine
    // `/api/api/...` request into something the caller never asked for.
    let upstream_path = parts
        .uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
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
            CacheLookup::Hit(body) => return json_response(StatusCode::OK, body),
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
                    json_response(status, bytes)
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
    if !websocket_origin_allowed(&headers) {
        return error_response(StatusCode::FORBIDDEN);
    }
    let Some(session) = authorize(&state, &headers) else {
        return error_response(StatusCode::UNAUTHORIZED);
    };
    ws.on_upgrade(move |socket| handle_socket(socket, state, session))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>, session: Session) {
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
                // Either way the stream ends; reconnecting tells the browser to
                // perform a full status refresh.
                Err(_) => break,
            },
            client = socket.recv() => match client {
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(_)) => break,
            },
            _ = ping_interval.tick() => {
                // A logout has to end this stream too, not just future requests.
                let revoked = match &session {
                    Session::Open => false,
                    Session::Active(id) => !state.sessions.is_live(id),
                };
                if revoked {
                    break;
                }
                if socket.send(Message::Ping(Bytes::new())).await.is_err() {
                    break;
                }
            },
        }
    }
}

/// Receive a SwitchBot webhook, forward the device context to WebSocket clients
/// and drop the device's cached status so the next poll reflects the change.
///
/// SwitchBot does not sign its webhooks, so this endpoint cannot authenticate
/// its caller. Everything that does not carry a plausible device identifier is
/// therefore dropped before it can touch the cache or reach a browser; the
/// frontend ignores updates without a deviceMac anyway.
async fn webhook(State(state): State<Arc<AppState>>, body: Bytes) -> StatusCode {
    let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&body) else {
        return StatusCode::BAD_REQUEST;
    };
    let Some(context) = payload.get("context") else {
        return StatusCode::NO_CONTENT;
    };
    let Some(mac) = context.get("deviceMac").and_then(|v| v.as_str()) else {
        return StatusCode::NO_CONTENT;
    };
    if !valid_device_key(mac) {
        return StatusCode::BAD_REQUEST;
    }
    invalidate_status(&state, mac);
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
    // Trimmed to match the login handler, which trims the submitted token —
    // otherwise a padded AUTH_TOKEN could never be entered.
    let auth_hash = env::var("AUTH_TOKEN")
        .ok()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .map(|t| hash_token(&t));
    let auth_enabled = auth_hash.is_some();
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
        sessions: Sessions::default(),
        login_gate: tokio::sync::Mutex::new(0),
        realtime: webhook_settings.is_some(),
        events,
        status_cache: Mutex::new(HashMap::new()),
        cache_ttl,
    });

    // Everything the browser talks to sits behind the cross-site guard. The
    // webhook is added after the layer: SwitchBot calls it from outside, so it
    // is the one route that must stay reachable cross-origin.
    let mut app = Router::new()
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/config", get(config))
        .route("/ws", get(ws_handler))
        .with_state(state.clone())
        .nest_service("/api/", any(api_proxy).with_state(state.clone()))
        .layer(axum::middleware::from_fn(reject_cross_site));
    if let Some((_, path)) = &webhook_settings {
        app = app.route(path, post(webhook).with_state(state.clone()));
    }
    let app = app
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

    #[test]
    fn tracks_session_lifecycle() {
        let sessions = Sessions::default();
        let id = session_id("cookie-value");
        assert!(!sessions.is_live(&id));

        sessions.start(id);
        assert!(sessions.is_live(&id));
        // A different cookie must not ride along on someone else's session.
        assert!(!sessions.is_live(&session_id("other-value")));

        sessions.revoke([id].into_iter());
        assert!(!sessions.is_live(&id));
    }

    #[test]
    fn expires_sessions_and_reaps_them_on_the_next_login() {
        let sessions = Sessions::default();
        let stale = session_id("stale");
        // Expired the instant it was recorded.
        lock(&sessions.0).insert(stale, Instant::now());
        assert!(!sessions.is_live(&stale));
        assert_eq!(lock(&sessions.0).len(), 1, "reading must not mutate");

        sessions.start(session_id("fresh"));
        assert_eq!(
            lock(&sessions.0).len(),
            1,
            "a login should have dropped the expired entry"
        );
    }

    #[test]
    fn caps_the_status_cache_without_locking_out_known_devices() {
        let mut cache = HashMap::new();
        for i in 0..MAX_CACHE_ENTRIES {
            cache.insert(format!("device-{i}"), Slot::default());
        }
        // Full: a device that is already tracked still gets through, a new one
        // (which a forged webhook could name) does not.
        assert!(has_room(&cache, "device-0"));
        assert!(!has_room(&cache, "device-new"));

        cache.remove("device-0");
        assert!(has_room(&cache, "device-new"));
    }

    #[test]
    fn rejects_implausible_device_keys() {
        assert!(valid_device_key("C1:2A:3B:4C:5D:6E"));
        assert!(valid_device_key("device-1"));
        assert!(!valid_device_key(""));
        assert!(!valid_device_key("a/b"));
        assert!(!valid_device_key("../../etc"));
        assert!(!valid_device_key(&"a".repeat(33)));
    }

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for (name, value) in pairs {
            let name = axum::http::HeaderName::from_bytes(name.as_bytes())
                .unwrap_or_else(|e| panic!("test header name {name:?} is invalid: {e}"));
            let value = HeaderValue::from_str(value)
                .unwrap_or_else(|e| panic!("test header value {value:?} is invalid: {e}"));
            headers.insert(name, value);
        }
        headers
    }

    #[test]
    fn accepts_only_same_origin_state_changes() {
        // Modern browsers: Sec-Fetch-Site decides on its own.
        assert!(same_origin(&headers(&[("sec-fetch-site", "same-origin")])));
        assert!(same_origin(&headers(&[("sec-fetch-site", "none")])));
        assert!(!same_origin(&headers(&[("sec-fetch-site", "cross-site")])));
        assert!(!same_origin(&headers(&[("sec-fetch-site", "same-site")])));
        // A cross-site request cannot hide its Origin by dropping the fetch
        // metadata header, because Origin alone still has to match Host.
        assert!(!same_origin(&headers(&[
            ("origin", "https://evil.example"),
            ("host", "localhost:3000"),
        ])));
        assert!(same_origin(&headers(&[
            ("origin", "http://localhost:3000"),
            ("host", "localhost:3000"),
        ])));
        // Non-browser clients send neither header and carry no ambient cookie.
        assert!(same_origin(&headers(&[("host", "localhost:3000")])));
    }

    #[test]
    fn accepts_websockets_only_from_the_requested_origin() {
        assert!(websocket_origin_allowed(&headers(&[
            ("sec-fetch-site", "same-origin"),
            ("origin", "https://app.example"),
            ("host", "app.example"),
        ])));
        assert!(!websocket_origin_allowed(&headers(&[
            ("sec-fetch-site", "cross-site"),
            ("origin", "https://evil.example"),
            ("host", "app.example"),
        ])));
        // Do not trust internally inconsistent fetch metadata either.
        assert!(!websocket_origin_allowed(&headers(&[
            ("sec-fetch-site", "same-origin"),
            ("origin", "https://evil.example"),
            ("host", "app.example"),
        ])));
        assert!(websocket_origin_allowed(&headers(&[(
            "host",
            "app.example",
        )])));
    }

    /// A directory that is guaranteed not to contain any static asset, so the
    /// route checks are exercised without depending on a frontend build.
    fn no_dist() -> &'static Path {
        Path::new("target/webhook-config-test-missing-dist")
    }

    #[test]
    fn canonicalizes_webhook_url_and_path_together() {
        assert_eq!(
            webhook_config("https://example.com", no_dist()),
            Ok((
                "https://example.com/webhook".to_string(),
                "/webhook".to_string()
            ))
        );
        assert_eq!(
            webhook_config("https://example.com/events/", no_dist()),
            Ok((
                "https://example.com/events".to_string(),
                "/events".to_string()
            ))
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
