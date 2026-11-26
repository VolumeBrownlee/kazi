/* Kazi service worker — offline shell, app icons and Android share target.
   Everything stays on the device; this worker never calls an external API. */

const CACHE_NAME = 'kazi-shell-v10';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './steady.css',
  './manifest.webmanifest',
  './fonts/archivo-var.woff2',
  './fonts/plex-mono-400.woff2',
  './fonts/plex-mono-500.woff2',
  './js/app.js',
  './js/store.js',
  './js/cv.js',
  './js/parse.js',
  './js/utils.js',
  './js/ai.js',
  './icons/favicon-64.png',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(request));
    return;
  }

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  let response = null;
  try {
    response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      await cache.put('./index.html', response.clone());
      return response;
    }
  } catch {
    /* Offline: serve the shell from cache below. */
  }
  return (await caches.match(request)) || (await cache.match('./index.html')) || response || Response.error();
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  let response = null;
  try {
    response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      await cache.put(request, response.clone());
      return response;
    }
  } catch {
    /* Offline: serve the cached asset below. */
  }
  return (await cache.match(request)) || response || Response.error();
}

async function handleShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('files')
      .filter(file => file && typeof file === 'object' && typeof file.name === 'string')
      .map(file => ({
        name: file.name,
        type: file.type || '',
        size: file.size || 0,
        blob: file
      }));
    await storeSharedPayload({
      title: String(form.get('title') || ''),
      text: String(form.get('text') || ''),
      url: String(form.get('url') || ''),
      files
    });
  } catch (error) {
    console.warn('Kazi could not read the shared item.', error);
  }
  return Response.redirect(new URL('index.html?shared=1', self.registration.scope).href, 303);
}

function openShareDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('kazi-shared', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('payload')) db.createObjectStore('payload', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Share database unavailable.'));
  });
}

async function storeSharedPayload(payload) {
  const db = await openShareDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('payload', 'readwrite');
    tx.objectStore('payload').put({
      id: 'latest',
      ...payload,
      at: new Date().toISOString()
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Shared item could not be stored.'));
  });
  db.close();
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('./#/today', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});
