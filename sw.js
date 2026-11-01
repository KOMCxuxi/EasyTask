// sw.js — 离线快取
// 更新版本时请把 CACHE 改成新名字（例如 pixel-notes-v2），
// 否则旧的快取会继续被使用。也可以在 App 的「设置 → 检查更新」手动清快取。

const CACHE = 'pixel-notes-v6';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './util.js',
  './db.js',
  './ics.js',
  './md.js',
  './richtext.js',
  './i18n.js',
  './manifest.webmanifest',
  './icons/mark.svg',
  './icons/favicon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 逐个快取：就算部署时漏了某个档案（例如 icons/），也不会让整个安装失败
      await Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
