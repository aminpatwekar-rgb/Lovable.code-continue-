// Minimal service worker: makes ONYX installable and shows an offline page.
// It never caches app data, API calls or authenticated pages.
const OFFLINE_URL = "/offline.html";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("onyx-offline-v1").then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== "onyx-offline-v1").map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE_URL)));
});
