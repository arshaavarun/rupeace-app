// sw.js - written by google/web_build.py. Network first for the screens, the last good copy when offline.
// Data calls go to script.google.com and are never cached.
const CACHE = 'rupeace-621218fac9';
const SHELL = ["./", "index.html", "app.css?v=621218fac9", "core.js?v=621218fac9", "charts.js?v=621218fac9", "datepicker.js?v=621218fac9", "phone.js?v=621218fac9", "phone-settings.js?v=621218fac9", "phone-worth.js?v=621218fac9", "phone-guide.js?v=621218fac9", "phone-update.js?v=621218fac9", "restore.js?v=621218fac9", "engine.js?v=621218fac9", "drive.js?v=621218fac9", "bridge.js?v=621218fac9", "sync-ui.js?v=621218fac9"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// The page and anything without a ?v= stamp: always asked fresh from the server (never the browser's 10-minute
// copy), so a new version reaches the phone the next time the app opens. Stamped files never change.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const fresh = e.request.mode === 'navigate' || !u.searchParams.has('v');
  const get = fresh ? fetch(u.href, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request);
  e.respondWith(get.then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
