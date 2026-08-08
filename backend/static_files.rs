use axum::{
    Router,
    extract::Request,
    http::{HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::Response,
};
use tower_http::services::{ServeDir, ServeFile};

// Both are relative to the working directory; the Dockerfile copies them under
// its WORKDIR. DIST_DIR is public because `webhook_config` refuses a webhook
// path that would shadow a built asset.
pub const DIST_DIR: &str = "dist";
const LOCALES_DIR: &str = "locales";

/// A content-hashed name is never reused, so its bytes can be held forever.
const IMMUTABLE: &str = "public, max-age=31536000, immutable";

/// index.html, the manifest, the service worker, the PWA icons and the locale
/// catalogs keep their names across deploys. ServeDir answers the revalidation
/// with a 304 from its ETag, so a CDN still absorbs the bytes; `public` is what
/// lets it store them.
const REVALIDATE: &str = "public, max-age=0, must-revalidate";

/// The app shell and the message catalogs, with the cache policy below applied
/// to them and to nothing else. main.rs merges this in last, so the layer here
/// never sees /api, /auth, /config or /ws.
pub fn router<S: Clone + Send + Sync + 'static>() -> Router<S> {
    router_for(DIST_DIR, &format!("{DIST_DIR}/index.html"))
}

/// The build output is what a test has to substitute, since dist/ only exists
/// once the frontend has been built. The shell is separate so a test can point
/// it at a file that is committed.
fn router_for<S: Clone + Send + Sync + 'static>(dist: &str, shell: &str) -> Router<S> {
    Router::new()
        .nest_service("/locales", ServeDir::new(LOCALES_DIR))
        .fallback_service(ServeDir::new(dist).fallback(ServeFile::new(shell)))
        .layer(middleware::from_fn(set_cache_control))
}

async fn set_cache_control(request: Request, next: Next) -> Response {
    let hashed = is_content_hashed(request.uri().path());
    let mut response = next.run(request).await;

    // A 404 under a hashed-looking path must not be pinned in the CDN past the
    // deploy that publishes the file.
    if !response.status().is_success() && response.status() != StatusCode::NOT_MODIFIED {
        return response;
    }

    // The dist fallback answers an unknown path with the shell rather than a
    // 404, so a stale hashed URL arrives here as a 200 carrying index.html.
    // Nothing hashed is served as HTML, which is what tells the two apart.
    let value = if hashed && !is_html(&response) {
        IMMUTABLE
    } else {
        REVALIDATE
    };
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static(value));

    response
}

/// Whether the request path names a content-hashed bundle. Reading the name
/// rather than the extension follows the split the build already makes in
/// parcel-plugins/namer.cjs, and leaves anything else on the safe side.
fn is_content_hashed(path: &str) -> bool {
    let name = path.rsplit_once('/').map_or(path, |(_, name)| name);
    let Some((stem, _extension)) = name.rsplit_once('.') else {
        return false;
    };
    let Some((_, hash)) = stem.rsplit_once('.') else {
        return false;
    };
    // Parcel writes eight lowercase hex digits; demanding at least that keeps a
    // merely dotted name (`vendor.min.js`) from being served as immutable.
    hash.len() >= 8 && hash.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn is_html(response: &Response) -> bool {
    response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("text/html"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Uri;
    use tower::ServiceExt;

    /// Send a GET through a real router, ServeDir and all.
    async fn get(router: Router<()>, path: &'static str) -> Response {
        let mut request = Request::new(Body::empty());
        *request.uri_mut() = Uri::from_static(path);
        // The router's error type is Infallible, so Ok is the only pattern.
        let Ok(response) = router.oneshot(request).await;
        response
    }

    fn cache_control(response: &Response) -> Option<&str> {
        response.headers().get(header::CACHE_CONTROL)?.to_str().ok()
    }

    /// dist/ is a build output that need not exist under `cargo test`, so the
    /// committed locales stand in for it and src/index.html for the shell.
    fn test_router(shell: &str) -> Router<()> {
        router_for(LOCALES_DIR, shell)
    }

    // Names taken from a real `parcel build`.
    #[test]
    fn hashed_bundles_are_recognized() {
        assert!(is_content_hashed("/switchbot-webui.04745d0c.js"));
        assert!(is_content_hashed("/switchbot-webui.bc8890e4.css"));
    }

    #[test]
    fn stable_names_are_not() {
        // The shell names the hashed bundles, so caching it strands the client
        // on the previous deploy.
        assert!(!is_content_hashed("/"));
        assert!(!is_content_hashed("/index.html"));
        assert!(!is_content_hashed("/locales/ja.json"));
        // Stable on purpose (parcel-plugins/namer.cjs); immutable would pin a
        // replaced icon on the device for a year.
        assert!(!is_content_hashed("/manifest.webmanifest"));
        assert!(!is_content_hashed("/sw.js"));
        assert!(!is_content_hashed("/icon-192.png"));
        assert!(!is_content_hashed("/icon-512.png"));
        assert!(!is_content_hashed("/favicon-16.png"));
        assert!(!is_content_hashed("/favicon-32.png"));
    }

    // None of these is Parcel output: merely dotted, too short, non-hex, upper
    // case, a hashed directory, a bare hash.
    #[test]
    fn only_a_hash_shaped_segment_counts() {
        assert!(!is_content_hashed("/vendor.min.js"));
        assert!(!is_content_hashed("/app.v2.css"));
        assert!(!is_content_hashed("/app.1234567.js"));
        assert!(!is_content_hashed("/app.zzzzzzzz.js"));
        assert!(!is_content_hashed("/app.4F3A2B1C.js"));
        assert!(!is_content_hashed("/4f3a2b1c/index.html"));
        assert!(!is_content_hashed("/4f3a2b1c.js"));
    }

    // The choice above only counts if it survives the layer down to ServeDir.
    #[tokio::test]
    async fn a_served_catalog_carries_the_header() {
        let response = get(router(), "/locales/ja.json").await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(cache_control(&response), Some(REVALIDATE));
    }

    #[tokio::test]
    async fn the_fallback_service_is_labelled_too() {
        // Every hashed bundle comes from the fallback, not from a route.
        let response = get(test_router("src/index.html"), "/ja.json").await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(cache_control(&response), Some(REVALIDATE));
    }

    #[tokio::test]
    async fn a_hashed_bundle_is_served_immutable() {
        // The one case with no committed stand-in: a file whose name carries a
        // hash, which only `parcel build` produces.
        let dist = std::env::temp_dir().join("switchbot-webui-immutable-test");
        std::fs::create_dir_all(&dist).unwrap();
        std::fs::write(dist.join("app.4f3a2b1c.js"), "export {};").unwrap();

        let router = router_for(dist.to_str().unwrap(), "src/index.html");
        let response = get(router, "/app.4f3a2b1c.js").await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(cache_control(&response), Some(IMMUTABLE));
    }

    #[tokio::test]
    async fn a_stale_hashed_url_does_not_pin_the_shell() {
        // The SPA fallback turns this miss into a 200 carrying index.html.
        // Marking that immutable would serve HTML for a bundle URL for a year.
        let response = get(test_router("src/index.html"), "/app.4f3a2b1c.js").await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(cache_control(&response), Some(REVALIDATE));
    }

    #[tokio::test]
    async fn a_miss_is_left_uncacheable() {
        // Without a shell to fall back to the miss stays a 404, and a
        // hash-shaped 404 is exactly what must not be pinned for a year.
        let response = get(test_router("locales/nonexistent.html"), "/app.4f3a2b1c.js").await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(cache_control(&response), None);
    }
}
