// Authenticated pages, API responses and tenant data are never cached.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate")
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>TêxtilFlow</title><body style="font:18px system-ui;padding:40px"><h1>Você está sem conexão</h1><p>Reconecte-se para consultar os dados atualizados da produção.</p><button onclick="location.reload()">Tentar novamente</button></body></html>',
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          ),
      ),
    );
});
