use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header::CONTENT_TYPE},
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
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
}

fn error_response(status: StatusCode) -> Response {
    let code = status.as_u16();
    let body = format!(r#"{{"statusCode":{code},"message":"{status}"}}"#);
    (status, [(CONTENT_TYPE, JSON_CT)], body).into_response()
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

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build HTTP client");

    let state = Arc::new(AppState {
        token,
        secret,
        client,
    });

    let app = Router::new()
        .nest_service("/api/", axum::routing::any(api_proxy).with_state(state))
        .fallback_service(ServeDir::new("dist").fallback(ServeFile::new("dist/index.html")));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind port");
    axum::serve(listener, app).await.expect("server error");
}
