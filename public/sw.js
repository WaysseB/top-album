/*
 * Service worker de Mon Top Albums.
 *
 * Regle de conception : cette application est DYNAMIQUE et AUTHENTIFIEE.
 * Mettre en cache une page HTML servirait un classement perime, et pire, une
 * page rendue en mode connecte pourrait etre resservie plus tard. Seuls les
 * fichiers statiques versionnes par Next (dont le nom contient une empreinte,
 * donc immuables) et les icones sont caches.
 *
 * Tout le reste — navigations, Server Actions, appels Supabase — passe
 * directement au reseau.
 */

const CACHE = "top-albums-static-v1"
const OFFLINE_URL = "/__offline"

const OFFLINE_PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hors ligne — Mon Top Albums</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
         background:#171717; color:#fafafa;
         font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:22rem; text-align:center; }
  h1 { font-size:1.25rem; margin:0 0 .5rem; }
  p { margin:0 0 1.5rem; color:#a1a1a1; line-height:1.55; }
  button { font:inherit; padding:.55rem 1.1rem; border-radius:.5rem;
           border:1px solid #3f3f3f; background:#262626; color:#fafafa; cursor:pointer; }
  button:hover { background:#333; }
</style>
</head>
<body>
<main>
  <h1>Pas de connexion</h1>
  <p>Votre classement est stocké en ligne&nbsp;: il faut une connexion pour l'afficher.</p>
  <button onclick="location.reload()">Réessayer</button>
</main>
</body>
</html>`

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.put(
          OFFLINE_URL,
          new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
        ),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

/** Fichiers surs a cacher : leur URL change des que leur contenu change. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /^\/(icon|apple-icon|placeholder)[\w.-]*\.(png|svg|jpg)$/.test(url.pathname)
  )
}

self.addEventListener("fetch", (event) => {
  const { request } = event

  // Les Server Actions sont des POST : jamais interceptees.
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
    return
  }

  // Navigations : reseau uniquement, avec une page de repli hors ligne.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((page) => page ?? Response.error())),
    )
  }

  // Tout le reste (donnees, RSC, Supabase) : on laisse passer sans intervenir.
})
