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

  // poids météo (0-1) par espèce et par pixel, interpolé entre les quatre coins de la tuile ; null si mode « Année normale »
  function poidsTuile(coords, layers, fPoids) {
    if (!fPoids) return null;
    const z = coords.z, n = 2 ** z;
    const lonO = (coords.x / n) * 360 - 180, lonE = ((coords.x + 1) / n) * 360 - 180;
    const latN = latTuile(coords.y, z), latS = latTuile(coords.y + 1, z);
    return layers.map((l) => {
      const a = fPoids(l.id, latN, lonO), b = fPoids(l.id, latN, lonE), c = fPoids(l.id, latS, lonO), d = fPoids(l.id, latS, lonE);
      return (p) => { const x = (p % T) / T, y = Math.floor(p / T) / T; return (a * (1 - x) + b * x) * (1 - y) + (c * (1 - x) + d * x) * y; };
    });
  }

  // getLayers() -> [{ id, color, opacity }] ; getMode() -> 'dominant' | 'overlay'
  // getPoids() -> null (année normale) ou fonction (id, lat, lon) -> 0-1 (météo de cette année)
  function create(index, getLayers, getMode, getPoids) {
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
            const val = (i, p) => { const d = datas[i]; return d && d[p * 4 + 3] >= amin ? d[p * 4] / 255 : -1; };
            const pw = poidsTuile(coords, layers, getPoids ? getPoids() : null);
            MW.render.paintClasses(out.data, T * T, val, layers, getMode(), pw ? (i, p) => pw[i](p) : null);
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
    return d[3] < 128 ? 0 : d[0] / 255;
  }

  MW.tuiles = { charger, create, valueAt };
})();
