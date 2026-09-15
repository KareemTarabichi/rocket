/* Rocket service worker: offline fallback for the app shell, and push notifications.
   Always tries the network first so a new deploy is picked up straight away. */
const CACHE = 'rocket-shell-v5';
const SHELL = ['/', '/index.html', '/styles.css', '/config.js', '/js/core.js', '/js/views.js', '/js/views-more.js',
  '/js/admin.js', '/js/live.js', '/js/pwa.js', '/js/ptr.js', '/js/notes.js', '/js/venture.js', '/js/app.js', '/icons/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // never touch Supabase or other hosts
  // no-cache: always check with the server, never reuse an old copy from the browser's cache
  event.respondWith((req.mode === 'navigate' ? fetch(req) : fetch(req, {cache:'no-cache'})).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, {ignoreSearch:true}).then(hit => hit || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {body: event.data && event.data.text()}; }
  event.waitUntil(self.registration.showNotification(data.title || 'Rocket', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-64.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: {url: data.url || '/'},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    for (const c of list) if (c.url.startsWith(self.location.origin)) { c.navigate(target); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
