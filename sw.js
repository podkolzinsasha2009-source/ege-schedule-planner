// ==========================================================================
// SERVICE WORKER ДЛЯ АВТОНОМНОЙ РАБОТЫ И ОФФЛАЙН-РЕЖИМА (PWA)
// «ХимБиоРус ЕГЭ» — Работает без сервера и интернета
// ==========================================================================

const CACHE_NAME = 'himbiorus-pwa-v11';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './sync.js',
  './app.js',
  './schedule_data.js',
  './manifest.json',
  './icon.png',
  './tablet_qr.svg',
  './tablet_qr.png',
  './' + encodeURIComponent('ХимБиоРус_Расписание_ЕГЭ.docx'),
  './ХимБиоРус_Расписание_ЕГЭ.docx'
];

// Установка: надежное индивидуальное кэширование, не падающее из-за одного файла
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('PWA cache.add warning for asset:', asset, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Активация: мгновенная очистка устаревших версий кэша и перехват управления
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('PWA: удаление устаревшего кэша:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Обработка сетевых запросов:
// 1. Для навигации/HTML страниц: Network First с фолбеком на кэш (планшет сразу получает свежую версию)
// 2. Для статических файлов: Cache First с безопасным переходом в сеть
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  if (event.request.url.includes('network-info.json')) {
    event.respondWith(fetch(event.request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  const isHtml = event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html');

  if (isHtml) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { ignoreSearch: true });
          if (cached) return cached;
          const fallback = await caches.match('./index.html', { ignoreSearch: true });
          if (fallback) return fallback;
          return new Response('Офлайн режим', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(async () => {
        const fallback = await caches.match(event.request, { ignoreSearch: true });
        if (fallback) return fallback;
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});