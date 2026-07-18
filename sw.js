/* Quiz Medicina — service worker
   Rende l'app utilizzabile completamente offline.
   Strategia:
     - HTML  : network-first (online = sempre aggiornata, offline = dalla cache)
     - font  : cache-first  (Google Fonts salvati al primo avvio online)
     - icone : cache-first
*/
const VERSION = 'quiz-med-v3';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];
// OCR: serve per far funzionare "Scansiona" senza connessione (~9 MB).
// Scaricati all'installazione; il core non-SIMD (per device vecchi) viene
// salvato al volo solo se quel device lo richiede davvero.
const OCR = [
  './tess/tesseract.min.js',
  './tess/worker.min.js',
  './tess/tesseract-core-simd-lstm.wasm.js',
  './tess/ron.traineddata.gz'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then(async (c) => {
        // prima l'app: dev'essere pronta subito
        await Promise.allSettled(CORE.map((u) => c.add(u)));
        // poi l'OCR: pesante, se fallisce non blocca l'installazione
        await Promise.allSettled(OCR.map((u) => c.add(u)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  // Pagina HTML: prima la rete, se non c'è si usa la copia salvata
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Font e risorse statiche: prima la cache
  if (isFont || url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
      })
    );
  }
});
