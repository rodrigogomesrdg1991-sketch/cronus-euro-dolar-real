self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Deixa o navegador lidar diretamente com pedidos fora da mesma origem ou SSO da Vercel
  if (url.origin !== self.location.origin || url.pathname.startsWith('/vercel/')) {
    return;
  }

  // Não intercepta pedidos de navegação que possam redirecionar para autenticação
  if (event.request.mode === 'navigate') {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => new Response('', { status: 504, statusText: 'Gateway Timeout' }))
  );
});
