// היטסטר רמיקס: מטמון מעטפת האפליקציה כדי שתעבוד גם בחיבור חלש
const CACHE = 'remix-202608012307';
const SHELL = [
  './',
  './index.html',
  './qr.js',
  './party_core.js',
  './party.js',
  './manifest.webmanifest',
  './data/cards.json',
  './data/pool.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // אודיו ו-API חיים: תמיד מהרשת, בלי מטמון
  if (url.hostname.endsWith('itunes.apple.com') || url.hostname.endsWith('spotify.com') ||
      url.hostname.endsWith('mzstatic.com') || url.pathname.endsWith('.m4a')) return;
  // קבצי נתונים גדולים (מאגר השירים): מהמטמון מיד, ורענון ברקע. עדכוני תוכן
  // מגיעים ממילא עם חותמת מטמון חדשה בכל פריסה, ואין סיבה לחכות לרשת בכל פתיחה.
  if (url.origin === location.origin && url.pathname.endsWith('.json')) {
    e.respondWith((async () => {
      const hit = await caches.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || caches.match('./');
    })());
    return;
  }
  // דף האפליקציה: קודם מהרשת כדי שעדכון ייראה מיד, ומטמון רק כגיבוי
  const fresh = url.origin === location.origin &&
    (e.request.mode === 'navigate' || url.pathname.endsWith('.html') ||
     url.pathname.endsWith('sw.js'));
  if (fresh) {
    e.respondWith((async () => {
      try {
        // רשת תחילה עם תקרת המתנה, כדי שחיבור איטי לא יתקע את פתיחת המשחק
        const res = await Promise.race([
          fetch(e.request),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
        ]);
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      } catch (err) {
        // התעלמות מפרמטרים בכתובת, אחרת חזרה מהרשאת ספוטיפיי בלי רשת לא תיפתח
        const hit = await caches.match(e.request, { ignoreSearch: true });
        return hit || caches.match('./');
      }
    })());
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
