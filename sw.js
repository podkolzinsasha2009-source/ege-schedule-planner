// ==========================================================================
// SERVICE WORKER ДЛЯ АВТОНОМНОЙ РАБОТЫ И ОФФЛАЙН-РЕЖИМА (PWA)
// «ХимБиоРус ЕГЭ» — Работает без сервера и интернета
// ==========================================================================

const CACHE_NAME = 'himbiorus-pwa-v30';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?v=30',
  './schedule_data.js?v=30',
  './qrcode.min.js?v=30',
  './store.js?v=30',
  './shapes.js?v=30',
  './ink.js?v=30',
  './photos.js?v=30',
  './app.js?v=30',
  './manifest.json',
  './icon.png'
];

// Установка: надежное индивидуальное кэширование, не падающее из-за одного файла
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(new Request(asset, { cache: 'reload' }));
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

// Обработка сетевых запросов: Network First для ВСЕХ файлов сайта.
// Кэш используется только когда нет интернета — так устройства никогда
// не застревают на старой (сломанной) версии app.js / styles.css.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const fallback = await caches.match('./index.html', { ignoreSearch: true });
          if (fallback) return fallback;
        }
        return new Response('', { status: 408, statusText: 'Offline' });
      })
  );
});
