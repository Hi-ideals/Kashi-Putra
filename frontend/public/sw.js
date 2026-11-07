/* ePaper service worker: offline fallback, image caching and web push. */
const VERSION = 'epaper-v1';
const STATIC_CACHE = `${VERSION}-static`;
const IMG_CACHE = `${VERSION}-images`;
const MAX_IMAGES = 150;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll([OFFLINE_URL, '/icons/icon-192.png', '/favicon.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: network first, offline page as fallback
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  // Newspaper images: cache first (files are immutable)
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(caches.open(IMG_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { cache.put(req, res.clone()); trim(IMG_CACHE, MAX_IMAGES); }
      return res;
    }));
    return;
  }
  // Built assets: stale-while-revalidate
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'ePaper', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'ePaper', {
    body: data.body || '', icon: data.icon || '/icons/icon-192.png', badge: '/icons/icon-192.png',
    image: data.image, tag: data.tag, data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url === target && 'focus' in c) return c.focus();
    return self.clients.openWindow(target);
  }));
});
