// PWA のインストール要件を満たすための最小構成 Service Worker。
// キャッシュは持たず、すべてのリクエストをネットワークへ素通しする。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
