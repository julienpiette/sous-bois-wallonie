/* « Pourquoi ici ? » : ce qui fait le potentiel d'un point, en mots simples.
   - Sol, pente, exposition : tuiles data/facteurs/12 (R/G = index du sigle de sol, B = exposition + pente) + data/sigles.json
     (produits par scripts/facteurs.py depuis la Carte Numérique des Sols, CC-BY, et le relief Copernicus)
   - Type de forêt : WALOUS 2023 (service du SPW, en direct)
   - Ancienneté des forêts : affichée seulement si MW.INTERRUPTEURS.anciennete (autorisation écrite du SPW), service en direct. */
(function (root) {
  const MW = (root.MW = root.MW || {});
  const T = 256, Z = 12, AGS = 'https://geoservices.wallonie.be/arcgis/rest/services/';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let siglesP = null;
  const sigles = () => (siglesP = siglesP || fetch('data/sigles.json').then((r) => r.json()).then((j) => j.sigles).catch(() => ({})));

  function pixel(lat, lng) {
    const n = 2 ** Z, s = Math.sin((lat * Math.PI) / 180);
    const xf = ((lng + 180) / 360) * n, yf = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    const x = Math.floor(xf), y = Math.floor(yf);
    return new Promise((ok) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 1;
        const ctx = c.getContext('2d');
        ctx.drawImage(im, Math.floor((xf - x) * T), Math.floor((yf - y) * T), 1, 1, 0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        ok(d[3] < 255 ? null : { idx: d[0] * 256 + d[1], octant: d[2] >> 4, pente: (d[2] & 15) * 2.5 });
      };
      im.onerror = () => ok(null);
      im.src = 'data/facteurs/' + Z + '/' + x + '/' + y + '.png';
    });
  }
  async function getJSON(url) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 12000);
    try { const r = await fetch(url, { signal: c.signal }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { clearTimeout(t); }
  }
  function walous(lat, lng) {
    const e = [lng - 0.005, lat - 0.005, lng + 0.005, lat + 0.005].join(',');
    return getJSON(AGS + 'SOL_SOUS_SOL/WAL_OCS_IA__2023/MapServer/identify?geometry=' + lng + ',' + lat + '&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=0&mapExtent=' + e + '&imageDisplay=200,200,96&returnGeometry=false&f=json')
      .then((j) => { const a = j && j.results && j.results[0] && j.results[0].attributes; if (!a) return null; const v = a['UniqueValue.Pixel Value'] || a['Pixel Value']; return v == null ? null : +v; });
  }

  function anciennete(lat, lng) {
    const I = MW.INTERRUPTEURS || {};
    if (!I.anciennete || !I.ancienneteService) return Promise.resolve(null);
    return getJSON(I.ancienneteService + '?geometry=' + lng + ',' + lat + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json')
      .then((j) => { const a = j && j.features && j.features[0] && j.features[0].attributes; if (!a) return null; const k = Object.keys(a).find((x) => /^class_code$/i.test(x)); return k ? +a[k] : null; });
  }
  const ANC = { 0: 'zone déboisée', 1: 'forêt ancienne, feuillue sans interruption depuis le 18e siècle', 2: 'forêt ancienne, passée aux résineux',
    3: 'forêt ancienne, passée un temps aux résineux puis revenue aux feuillus', 4: 'boisement feuillu récent (après le 18e siècle)', 5: 'plantation résineuse récente (après le 18e siècle)' };

  const FORET = { 1: 'surface artificielle', 2: 'bâtiment', 3: 'voie ferrée', 4: 'sol nu', 5: 'eau', 6: 'culture', 7: 'prairie',
    8: 'résineux de plus de 3 m', 9: 'feuillus de plus de 3 m', 80: 'jeunes résineux (moins de 3 m)', 90: 'jeunes feuillus (moins de 3 m)' };
  const CHIMIE = ['acide', 'ni très acide ni calcaire', 'calcaire'];
  const VERSANT = ['', 'nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];

  async function expliquer(lat, lng) {
    const [px, sg, w, a] = await Promise.all([pixel(lat, lng), sigles(), walous(lat, lng), anciennete(lat, lng)]);
    const li = [];
    if (px && px.idx && sg[px.idx]) {
      const [sigle, texture, drainage, chimie, sup, special] = sg[px.idx];
      if (special) li.push(['Sol', special + (sigle && sigle !== 'NC' ? ' (sigle ' + sigle + ')' : '')]);
      else {
        li.push(['Sol', 'sol ' + texture + (chimie >= 0 ? ', ' + CHIMIE[chimie] : '') + (sup ? ', peu profond' : '') + ' (sigle ' + sigle + ')']);
        if (drainage) li.push(['Eau', drainage]);
      }
    } else li.push(['Sol', 'pas de donnée de sol ici']);
    if (px) li.push(['Relief', px.octant ? 'versant ' + VERSANT[px.octant] + ', pente d’environ ' + Math.round(px.pente) + '°' +
      ([1, 2, 8].includes(px.octant) ? ' : reste frais et humide plus longtemps' : [4, 5, 6].includes(px.octant) ? ' : se réchauffe vite' : '') : 'terrain plat ou presque']);
    if (w != null) li.push(['Forêt', FORET[w] || 'occupation ' + w]);
    if (a != null && ANC[a]) li.push(['Ancienneté', ANC[a]]);
    return '<dl class="pourquoi">' + li.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' +
      '<p class="petit discret">Sources : Carte des sols (SPW), WALOUS 2023, relief Copernicus' + (a != null ? ', ancienneté des forêts (SPW)' : '') + '.</p>';
  }

  MW.pourquoi = { expliquer };
})(typeof window !== 'undefined' ? window : globalThis);
