use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{
        HeaderMap, HeaderValue, StatusCode,
        header::{CONTENT_TYPE, COOKIE, SET_COOKIE, WWW_AUTHENTICATE},
    },
    response::{IntoResponse, Response},
};
use base64::{
    Engine,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};
use std::{
    env,
    net::SocketAddr,
    sync::Arc,
    time::{Duration, SystemTime},
};
use tower_http::services::{ServeDir, ServeFile};

const SWITCHBOT_API: &str = "https://api.switch-bot.com";
const JSON_CT: &str = "application/json";
const MAX_BODY_BYTES: usize = 1024 * 1024;

struct AppState {
    token: HeaderValue,
    secret: String,
    client: reqwest::Client,
    /// AUTH_TOKEN の SHA-256 ハッシュ (base64url)。None なら認証なしで動作する
    auth_hash: Option<String>,
}

fn error_response(status: StatusCode) -> Response {
    let code = status.as_u16();
    let body = format!(r#"{{"statusCode":{code},"message":"{status}"}}"#);
    (status, [(CONTENT_TYPE, JSON_CT)], body).into_response()
}

fn hash_token(token: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(token.as_bytes()))
}

/// タイミング攻撃で比較対象の値を推測されないよう、両辺を再ハッシュしてから比較する
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

/// AUTH_TOKEN と照合し、一致すれば認証 Cookie を発行する。
/// Cookie にはトークンそのものではなくハッシュを保存する。
async fn login(State(state): State<Arc<AppState>>, body: String) -> Response {
    let Some(expected) = &state.auth_hash else {
        return error_response(StatusCode::NOT_FOUND);
    };
    if !eq_hashed(&hash_token(body.trim()), expected) {
        // ブルートフォースを遅らせるため、失敗時は少し待ってから応答する
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

/// SwitchBot API v1.1 の認証ヘッダ (token + HMAC-SHA256 署名) を生成する
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

async fn api_proxy(State(state): State<Arc<AppState>>, req: Request<Body>) -> Response {
    let (parts, body) = req.into_parts();
    if !is_authorized(&state, &parts.headers) {
        // 上流 SwitchBot API の 401 と区別できるよう、このサーバーの認証拒否にのみ
        // WWW-Authenticate を付ける (フロントはこれを見てログイン画面を出す)
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
                Ok(bytes) => (status, [(CONTENT_TYPE, JSON_CT)], bytes).into_response(),
                Err(_) => error_response(StatusCode::BAD_GATEWAY),
            }
        }
        Err(e) => {
            eprintln!("Proxy error: {e}");
            error_response(StatusCode::BAD_GATEWAY)
        }
    }
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    let token = env::var("SWITCHBOT_TOKEN").expect("SWITCHBOT_TOKEN must be set");
    let token = HeaderValue::from_str(&token).expect("SWITCHBOT_TOKEN contains invalid characters");
    let secret = env::var("SWITCHBOT_SECRET").expect("SWITCHBOT_SECRET must be set");
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);
    let auth_hash = env::var("AUTH_TOKEN")
        .ok()
        .filter(|t| !t.is_empty())
        .map(|t| hash_token(&t));
    if auth_hash.is_none() {
        eprintln!("warning: AUTH_TOKEN is not set; the UI is accessible without authentication");
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build HTTP client");

    let state = Arc::new(AppState {
        token,
        secret,
        client,
        auth_hash,
    });

    let app = Router::new()
        .route("/auth/login", axum::routing::post(login))
        .with_state(state.clone())
        .nest_service("/api/", axum::routing::any(api_proxy).with_state(state))
        .fallback_service(ServeDir::new("dist").fallback(ServeFile::new("dist/index.html")));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind port");
    axum::serve(listener, app).await.expect("server error");
}
