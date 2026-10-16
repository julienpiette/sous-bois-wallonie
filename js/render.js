/* Carte de chaleur : interpolation IDW depuis la grille météo, masque du contour,
   colorisation sur canvas, projection Web Mercator (L.imageOverlay). */
(function (root) {
  const MW = (root.MW = root.MW || {});
  const K = 4;

  function neighbours(lat, lon, grid) {
    const k = Math.cos((lat * Math.PI) / 180), best = [];
    for (let i = 0; i < grid.length; i++) {
      const d = Math.hypot((grid[i].lon - lon) * k, grid[i].lat - lat);
      best.push([d, i]);
    }
    best.sort((a, b) => a[0] - b[0]);
    const sel = best.slice(0, K);
    if (sel[0][0] < 1e-9) return { idx: [sel[0][1]], w: [1] };
    let tot = 0; const w = sel.map((s) => { const x = 1 / (s[0] * s[0]); tot += x; return x; });
    return { idx: sel.map((s) => s[1]), w: w.map((x) => x / tot) };
  }

  // grid null : masque seul (pas d'IDW), pour le mode potentiel sans météo
  function create(grid, W) {
    W = W || 480;
    const B = MW.BBOX, g = MW.geo;
    const y0 = g.mercY(B.south), y1 = g.mercY(B.north);
    const H = Math.max(1, Math.round((W * (y1 - y0)) / (((B.east - B.west) * Math.PI) / 180)));
    const mask = new Uint8Array(W * H), nb = new Int16Array(W * H * K).fill(-1), wt = new Float32Array(W * H * K);
    let inside = 0;
    for (let y = 0; y < H; y++) {
      const lat = g.latFromMercY(y1 - ((y + 0.5) / H) * (y1 - y0));
      for (let x = 0; x < W; x++) {
        const lon = B.west + ((x + 0.5) / W) * (B.east - B.west);
        if (!g.pointInPolygon(lon, lat, MW.WALLONIA)) continue;
        const p = y * W + x; mask[p] = 1; inside++;
        if (!grid) continue;
        const n = neighbours(lat, lon, grid);
        for (let j = 0; j < n.idx.length; j++) { nb[p * K + j] = n.idx[j]; wt[p * K + j] = n.w[j]; }
      }
    }
    return { W, H, mask, nb, wt, inside, grid };
  }

  // values: 1 valeur par point de grille → champ par pixel (−1 hors contour)
  function field(h, values) {
    const f = new Float32Array(h.W * h.H).fill(-1);
    for (let p = 0; p < f.length; p++) {
      if (!h.mask[p]) continue;
      let v = 0;
      for (let j = 0; j < K; j++) { const i = h.nb[p * K + j]; if (i >= 0) v += values[i] * h.wt[p * K + j]; }
      f[p] = v;
    }
    return f;
  }

  function valueAt(grid, values, lat, lon) {
    const n = neighbours(lat, lon, grid); let v = 0;
    for (let j = 0; j < n.idx.length; j++) v += values[n.idx[j]] * n.w[j];
    return { v, nearest: n.idx[0] };
  }

  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const alphaOf = (v) => (v < 0.2 ? 0 : Math.pow((v - 0.2) / 0.8, 0.7));

  // layers: [{ field, potential|null, color }] ; mode: 'dominant' | 'overlay'
  function paint(h, layers, mode, opacity) {
    const cv = document.createElement('canvas'); cv.width = h.W; cv.height = h.H;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(h.W, h.H), d = img.data;
    const cols = layers.map((l) => hex(l.color));
    for (let p = 0; p < h.W * h.H; p++) {
      if (!h.mask[p]) continue;
      const o = p * 4;
      if (mode === 'dominant') {
        let bv = 0, bi = -1;
        for (let i = 0; i < layers.length; i++) {
          const v = layers[i].field[p] * (layers[i].potential ? layers[i].potential[p] : 1);
          if (v > bv) { bv = v; bi = i; }
        }
        if (bi < 0) continue;
        const a = alphaOf(bv) * opacity;
        d[o] = cols[bi][0]; d[o + 1] = cols[bi][1]; d[o + 2] = cols[bi][2]; d[o + 3] = Math.round(a * 255);
      } else {
        let r = 0, g = 0, b = 0, A = 0;
        for (let i = 0; i < layers.length; i++) {
          const v = layers[i].field[p] * (layers[i].potential ? layers[i].potential[p] : 1);
          const a = alphaOf(v) * opacity;
          if (a <= 0) continue;
          const na = a + A * (1 - a);
          r = (cols[i][0] * a + r * A * (1 - a)) / na; g = (cols[i][1] * a + g * A * (1 - a)) / na; b = (cols[i][2] * a + b * A * (1 - a)) / na; A = na;
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = Math.round(A * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /* ---------- potentiel de site seul, en classes nettes (MW.CLASSES) ---------- */
  // -1 = non colorié (sous le premier seuil ou hors forêt), sinon index de classe
  function classOf(v) {
    const b = MW.CLASSES.breaks;
    if (!(v >= b[0])) return -1;
    let c = 0;
    while (c + 1 < b.length && v >= b[c + 1]) c++;
    return c;
  }
  function tint(rgb, t) {
    return t >= 0 ? rgb.map((x) => Math.round(x + (255 - x) * t)) : rgb.map((x) => Math.round(x * (1 + t)));
  }
  // couleurs [r,g,b] d'une espèce, une par classe, de la plus claire à la plus foncée
  function ramp(color) { return MW.CLASSES.tint.map((t) => tint(hex(color), t)); }

  // gris des bons milieux où la météo ne suit pas (mode « Météo de cette année »)
  const GRIS = '#5d665b';
  // Colorie n pixels dans out (RGBA). val(i, p) = valeur 0-1 de l'espèce i au pixel p, -1 si hors forêt.
  // layers: [{ color, opacity }] ; mode: 'dominant' | 'overlay'
  // sec(p) facultatif = sécheresse de fond 0-1 au pixel (mode « Météo de cette année ») :
  // - pénalité progressive : le rang perd jusqu'à MW.SECHERESSE.PENALITE_MAX (une classe de moins au pire) ;
  // - grisé seulement au-delà de MW.SECHERESSE.SEUIL_GRIS (sécheresse extrême). Le froid, le gel ou la saison
  //   ne grisent jamais : le gris veut dire « manque d'eau », rien d'autre.
  function paintClasses(out, n, val, layers, mode, sec) {
    const ramps = layers.map((l) => ramp(l.color)), gris = ramp(GRIS), X = MW.SECHERESSE || { PENALITE_MAX: 0, SEUIL_GRIS: 2 };
    for (let p = 0; p < n; p++) {
      const o = p * 4, sp = sec ? sec(p) : 0, f = 1 - X.PENALITE_MAX * sp, bon = sp < X.SEUIL_GRIS;
      if (mode === 'dominant') {
        let bv = -1, bi = -1;
        for (let i = 0; i < layers.length; i++) { const v = val(i, p); if (v > bv) { bv = v; bi = i; } }
        const k = bi < 0 ? -1 : classOf(bv * f);
        if (k < 0) continue;
        const c = bon ? ramps[bi][k] : gris[k];
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = Math.round(layers[bi].opacity * (bon ? 1 : 0.85) * 255);
      } else {
        let r = 0, g = 0, b = 0, A = 0;
        for (let i = 0; i < layers.length; i++) {
          const v = val(i, p), k = v < 0 ? -1 : classOf(v * f);
          if (k < 0) continue;
          const c = bon ? ramps[i][k] : gris[k], a = layers[i].opacity * (bon ? 1 : 0.85), na = a + A * (1 - a);
          r = (c[0] * a + r * A * (1 - a)) / na; g = (c[1] * a + g * A * (1 - a)) / na; b = (c[2] * a + b * A * (1 - a)) / na; A = na;
        }
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = Math.round(A * 255);
      }
    }
  }

  // charge data/potentiel-<id>.png (gris, Web Mercator sur BBOX) → Float32Array [0..1] ou null
  function loadPotential(h, url) {
    return new Promise((ok) => {
      const im = new Image();
      im.onload = () => {
        try {
          const cv = document.createElement('canvas'); cv.width = h.W; cv.height = h.H;
          const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0, h.W, h.H);
          const px = ctx.getImageData(0, 0, h.W, h.H).data, f = new Float32Array(h.W * h.H);
          for (let p = 0; p < f.length; p++) f[p] = px[p * 4] / 255;
          ok(f);
        } catch (e) { ok(null); }
      };
      im.onerror = () => ok(null);
      im.src = url;
    });
  }

  MW.render = { create, field, valueAt, paint, loadPotential, classOf, ramp, paintClasses };
})(typeof window !== 'undefined' ? window : globalThis);
