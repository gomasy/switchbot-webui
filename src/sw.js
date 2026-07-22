// Minimal service worker to satisfy the PWA installability requirement.
// Holds no cache and passes every request straight through to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
