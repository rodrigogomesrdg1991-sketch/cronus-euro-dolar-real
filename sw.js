self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('vercel.com') ||
    url.pathname.startsWith('/vercel/') ||
    event.request.mode === 'navigate'
  ) {
    return;
  }

  event.respondWith(fetch(event.request));
});
