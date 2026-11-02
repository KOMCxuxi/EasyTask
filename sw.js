// sw.js — 离线快取（v7：导航与程式码改為「网路优先」，避免更新后仍拿到旧版）
// 更新版本时把 CACHE 改成新名字；旧快取会在 activate 时删掉。
// 也可以在 App 的「设置 → 检查更新」手动清快取。

const CACHE = 'pixel-notes-v10';

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
  './icons/app-icon-32.png',
  './icons/app-icon-180.png',
  './icons/app-icon-192.png',
  './icons/app-icon-512.png',
  './icons/app-icon-1024.png',
  './icons/app-icon-maskable-512.png',
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

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  // preflight / 带参数的请求不写进快取，避免污染离线包
  if (url.search) return;

  event.respondWith(networkFirst(request));
});
