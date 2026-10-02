// Offline cache for the web/PWA build (not used inside the native app). Network-first so updates always win.
const V = 'rc3d-v1', FILES = ['./', 'index.html', 'css/style.css', 'manifest.json', 'icon-192.png', 'icon-512.png', 'vendor/three/three.module.min.js',
  'vendor/three/addons/controls/OrbitControls.js', 'vendor/three/addons/environments/RoomEnvironment.js', 'vendor/three/addons/geometries/RoundedBoxGeometry.js', 'vendor/three/addons/utils/BufferGeometryUtils.js',
  ...['chess-engine', 'ai-worker', 'config', 'storage', 'audio', 'ads', 'textures', 'pieces', 'scene', 'app'].map(f => 'js/' + f + '.js')];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => { e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(ch => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request))); });
