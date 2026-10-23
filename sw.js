// Service worker: houdt de app en de meegeleverde recepten offline beschikbaar.
// Verhoog VERSIE bij elke nieuwe versie van de app-bestanden.
const VERSIE = 'kookboek-v1';
const BESTANDEN = [
  './', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'data/recepten.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIE).then(c => c.addAll(BESTANDEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('kookboek-') && k !== VERSIE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Google-sync gaat rechtstreeks naar het netwerk
  // Eerst uit cache (snel + offline), op de achtergrond verversen
  e.respondWith(caches.open(VERSIE).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || cache.match('index.html');
  }));
});
