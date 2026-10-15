/* Service worker : appli installable et lisible sans réseau.
   - pages : réseau d'abord, sinon dernière version enregistrée, sinon hors-ligne.html
   - CSS/JS/JSON du site : réseau d'abord (3 s max, pour que page et scripts restent de la même version), sinon cache
   - images du site : version en cache tout de suite, mise à jour en arrière-plan
   - tuiles de potentiel, de facteurs et fond de carte déjà vus : cache d'abord (plafonné)
   - services publics (chasse, propriétés, météo, recherche) : JAMAIS en cache ici (une battue périmée serait dangereuse)
   Changer VERSION à chaque mise en ligne d'une nouvelle version. */
const VERSION = 'sb-20261016-0134';
const COQUILLE = [
  './', 'index.html', 'bulletin.html', 'carte.html', 'droit.html', 'battues.html', 'carnet.html', 'guide.html', 'especes.html',
  'avant-de-manger.html', 'glossaire.html', 'materiel.html', 'pros.html', 'approche.html', 'recettes.html', 'conservation.html',
  'mentions.html', 'hors-ligne.html', 'manifest.webmanifest',
  'css/site.css', 'css/style.css',
  'js/site-config.js', 'js/interrupteurs.js', 'js/site.js', 'js/config.js', 'js/geo.js', 'js/weather.js', 'js/model.js', 'js/render.js', 'js/tuiles.js',
  'js/meteo-carte.js', 'js/main.js', 'js/droit.js', 'js/pourquoi.js', 'js/plantes.js', 'js/fiches-plantes.js', 'js/bulletin.js', 'js/carnet.js', 'js/garde-manger.js', 'js/recettes.js', 'js/produits.js',
  'data/massifs.json', 'data/communes.json', 'data/sigles.json', 'data/tuiles/index.json',
  'data/recettes/index.json',  // fiches de recette : mises en cache à la première lecture
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon.svg'
];
// sb-tuiles-3 : tuiles recalculées avec l'ancienneté des forêts (prototype, 14/10/2026) ; les anciens caches de tuiles sont supprimés à l'activation
const MAX = { 'sb-tuiles-3': 4000, 'sb-fond': 2000, 'sb-ext': 60 };

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== VERSION && !(n in MAX)).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

async function plafonner(nom) {
  const c = await caches.open(nom), k = await c.keys();
  if (k.length > MAX[nom]) await Promise.all(k.slice(0, k.length - MAX[nom]).map((r) => c.delete(r)));
}
async function cacheDabord(req, nom) {
  const c = await caches.open(nom), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); if (Math.random() < 0.05) plafonner(nom); }
  return r;
}
async function pageReseauDabord(req) {
  const c = await caches.open(VERSION);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch (e) {
    return (await c.match(req, { ignoreSearch: true })) || (await c.match('hors-ligne.html'));
  }
}
// réseau d'abord ; si le réseau traîne (forêt), la copie en cache au bout de `delai` ms
async function reseauVite(req, nom, delai) {
  const c = await caches.open(nom);
  const reseau = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; });
  const hit = await Promise.race([reseau.catch(() => null), new Promise((ok) => setTimeout(() => ok(null), delai))]);
  if (hit) return hit;
  return (await c.match(req, { ignoreSearch: true })) || reseau;
}
async function vieuxPuisNeuf(req, nom) {
  const c = await caches.open(nom), hit = await c.match(req, { ignoreSearch: true });
  const neuf = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || neuf;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (req.mode === 'navigate') return e.respondWith(pageReseauDabord(req));
    if (/\/data\/(plantes\/)?(tuiles|facteurs)\//.test(u.pathname)) return e.respondWith(cacheDabord(req, 'sb-tuiles-3'));
    if (/\.(css|js|json|webmanifest)$/.test(u.pathname)) return e.respondWith(reseauVite(req, VERSION, 3000));
    if (/\.(png|svg)$/.test(u.pathname)) return e.respondWith(vieuxPuisNeuf(req, VERSION));
    return;
  }
  if (/tile\.openstreetmap\.org|cartoweb\.wmts\.ngi\.be|tile\.opentopomap\.org/.test(u.host)) return e.respondWith(cacheDabord(req, 'sb-fond'));
  if (/cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u.host)) return e.respondWith(cacheDabord(req, 'sb-ext'));
  // services publics (geoservices.wallonie.be, dont les photos aériennes de la vue « Réel », open-meteo, nominatim) : réseau uniquement
});
