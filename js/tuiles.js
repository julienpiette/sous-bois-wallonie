/* Potentiel de site en tuiles XYZ : <base>/<id>/{z}/{x}/{y}.png (base : data/tuiles/, ou data/plantes/tuiles/ en mode plantes) (gris = rang parmi les forêts,
   alpha = forêt), produites par scripts/potentiel.py. Recoloration dans le navigateur (classes, opacité
   par espèce, modes Dominante / Superposé). Au-delà du zoom max des tuiles, la tuile parente est agrandie
   avec lissage puis reclassée : contours lisses au lieu de gros pixels. */
(function () {
  const MW = window.MW;
  const T = 256, cache = new Map();
  const url = (index, id, z, x, y) => (index.base || 'data/tuiles/') + id + '/' + z + '/' + x + '/' + y + '.png';

  // image d'une tuile (null si absente : tuile sans forêt, exclue à la génération)
  function image(u) {
    if (!cache.has(u)) {
      if (cache.size > 1500) cache.delete(cache.keys().next().value);
      cache.set(u, new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = u; }));
    }
    return cache.get(u);
  }

  async function charger(base) {
    base = base || 'data/tuiles/';
    try {
      const r = await fetch(base + 'index.json', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json(); j.base = base;
      return j;
    } catch (e) { return null; }
  }

  // portion (ox, oy, span) de la tuile source, agrandie en 256x256 (lissée si span < 256) -> RGBA ou null
  function pixels(im, ox, oy, span, work) {
    if (!im) return null;
    const c = work.getContext('2d', { willReadFrequently: true });
    c.clearRect(0, 0, T, T);
    c.imageSmoothingEnabled = span < T;
    c.imageSmoothingQuality = 'high';
    c.drawImage(im, ox, oy, span, span, 0, 0, T, T);
    return c.getImageData(0, 0, T, T).data;
  }

  // latitude du bord nord d'une rangée de tuiles y au zoom z
  const latTuile = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

  // Sécheresse (0-1) par pixel : échantillonnée sur une grille de 9 x 9 points dans la tuile puis interpolée.
  // (Avant : 4 coins seulement ; dézoomé, une tuile couvre presque toute la Wallonie et quelques coins secs
  // grisaient tout.) null si mode « Année normale ».
  const G = 8;
  function secTuile(coords, fSec) {
    if (!fSec) return null;
    const z = coords.z, n = 2 ** z, ech = new Float32Array((G + 1) * (G + 1));
    for (let j = 0; j <= G; j++) {
      const lat = latTuile(coords.y + j / G, z);
      for (let i = 0; i <= G; i++) ech[j * (G + 1) + i] = fSec(lat, ((coords.x + i / G) / n) * 360 - 180);
    }
    return (p) => {
      const x = ((p % T) / T) * G, y = (Math.floor(p / T) / T) * G, i = Math.min(G - 1, Math.floor(x)), j = Math.min(G - 1, Math.floor(y)), fx = x - i, fy = y - j;
      const a = ech[j * (G + 1) + i], b = ech[j * (G + 1) + i + 1], c = ech[(j + 1) * (G + 1) + i], d = ech[(j + 1) * (G + 1) + i + 1];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    };
  }
  // petit bonus de latitude (MW.BONUS_SUD) ajouté au rang du site, par rangée de pixels
  function bonusSud(lat) {
    const B = MW.BONUS_SUD; if (!B) return 0;
    return B.BONUS_MAX * Math.max(0, Math.min(1, (B.LAT_SANS_BONUS - lat) / (B.LAT_SANS_BONUS - B.LAT_BONUS_MAX)));
  }
  function bonusTuile(coords) {
    const z = coords.z, out = new Float32Array(T);
    for (let r = 0; r < T; r++) out[r] = bonusSud(latTuile(coords.y + (r + 0.5) / T, z));
    return out;
  }

  // getLayers() -> [{ id, color, opacity }] ; getMode() -> 'dominant' | 'overlay'
  // getSec() -> null (année normale) ou fonction (lat, lon) -> sécheresse 0-1 (météo de cette année)
  function create(index, getLayers, getMode, getSec) {
    const B = MW.BBOX;
    const Layer = L.GridLayer.extend({
      createTile(coords, done) {
        const tile = document.createElement('canvas');
        tile.width = tile.height = T;
        const layers = getLayers();
        const nz = Math.min(coords.z, index.maxZoom), f = 2 ** (coords.z - nz), span = T / f;
        const sx = Math.floor(coords.x / f), sy = Math.floor(coords.y / f);
        const ox = (coords.x - sx * f) * span, oy = (coords.y - sy * f) * span;
        Promise.all(layers.map((l) => image(url(index, l.id, nz, sx, sy)))).then((ims) => {
          if (ims.some(Boolean)) {
            const work = document.createElement('canvas');
            work.width = work.height = T;
            const datas = ims.map((im) => pixels(im, ox, oy, span, work));
            const ctx = tile.getContext('2d'), out = ctx.createImageData(T, T);
            // alpha = part de forêt dans le pixel : dézoomé, un massif boisé à 20 % suffit pour être affiché
            const amin = nz >= index.maxZoom ? 128 : 50;
            const bonus = bonusTuile(coords);
            // dézoomé, chaque pixel est une moyenne de nombreuses parcelles : les rangs se tassent vers le milieu et
            // peu de pixels atteignent « Bon ». On compense légèrement ce tassement aux petits zooms seulement.
            const tasse = nz <= 8 ? 1 / 0.88 : nz <= 10 ? 1 / 0.94 : 1;
            const val = (i, p) => { const d = datas[i]; return d && d[p * 4 + 3] >= amin ? Math.min(1, (d[p * 4] / 255) * tasse + bonus[Math.floor(p / T)]) : -1; };
            MW.render.paintClasses(out.data, T * T, val, layers, getMode(), secTuile(coords, getSec ? getSec() : null));
            ctx.putImageData(out, 0, 0);
          }
          done(null, tile);
        });
        return tile;
      }
    });
    return new Layer({ pane: 'heat', minZoom: index.minZoom, bounds: L.latLngBounds([[B.south, B.west], [B.north, B.east]]) });
  }

  // valeur 0-1 de l'espèce au point (0 = hors forêt), null hors emprise ou sans tuiles
  async function valueAt(index, id, lat, lng) {
    const B = MW.BBOX;
    if (!index || lat < B.south || lat > B.north || lng < B.west || lng > B.east) return null;
    const z = index.maxZoom, n = 2 ** z, s = Math.sin((lat * Math.PI) / 180);
    const xf = ((lng + 180) / 360) * n, yf = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    const x = Math.floor(xf), y = Math.floor(yf);
    const im = await image(url(index, id, z, x, y));
    if (!im) return 0;
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d');
    ctx.drawImage(im, Math.floor((xf - x) * T), Math.floor((yf - y) * T), 1, 1, 0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return d[3] < 128 ? 0 : Math.min(1, d[0] / 255 + bonusSud(lat));
  }

  MW.tuiles = { charger, create, valueAt, bonusSud };
})();
