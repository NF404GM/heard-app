const APP_VERSION = '1.8.1';
const CACHE_NAME = `heard-v${APP_VERSION}`;
const ART_CACHE = `heard-artwork-v${APP_VERSION}`;
const SHELL_PATHS = ['index.html', 'manifest.json'];
const REMOTE_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/vibrant.js/1.0.0/Vibrant.min.js'
];

const getScopeRoot = () => new URL('.', self.registration?.scope || '/').href;
const toScopeUrl = path => new URL(path, self.registration?.scope || '/').href;

// Install: cache app shell
self.addEventListener('install', event => {
  const scopeRoot = getScopeRoot();
  const shellAssets = SHELL_PATHS.map(toScopeUrl);
  const staticAssets = [scopeRoot, ...shellAssets, ...REMOTE_ASSETS];
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(staticAssets).catch(err => {
        console.warn('SW: Some assets failed to cache', err);
        // Still activate even if some assets fail
        return cache.addAll(shellAssets);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== ART_CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // iTunes API — network only
  if (url.hostname === 'itunes.apple.com') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ results: [] }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Album artwork — cache first, then network
  if (url.hostname.includes('mzstatic.com')) {
    event.respondWith(
      caches.open(ART_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // Navigation requests — network first so updates show immediately
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(toScopeUrl('index.html')))
    );
    return;
  }

  // Everything else — cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Listen for update messages
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
