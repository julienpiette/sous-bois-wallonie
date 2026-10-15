/* Mode « Météo de cette année » de la carte.
   La météo des derniers mois (pluie, température, mémoire de sécheresse, gel, saison) est lue à une grille d'une
   trentaine de points (Open-Meteo, usage non commercial, cache 3 h), l'état de chaque espèce est calculé avec le même
   modèle que le bulletin (js/model.js), puis interpolé sur la carte : les bons milieux où la météo ne suit pas
   sont grisés (js/tuiles.js). Résolution d'environ 30 km : une tendance régionale, pas un bois précis. */
(function () {
  const MW = window.MW;
  // poids d'affichage par état : à partir de 0,5 le milieu garde sa couleur, en dessous il est grisé
  const POIDS = { pousse: 1, prepare: 0.85, moyen: 0.6, sec: 0, froid: 0, chaud: 0, gel: 0, defav: 0.2, hors: 0 };
  let pts = null, etats = null, info = null, enCours = null;

  // grille grossière (environ 30 km) sur la Wallonie et ses abords immédiats
  function grille() {
    const out = [];
    for (let lat = 49.5; lat <= 50.86; lat += 0.27) {
      for (let lon = 2.9; lon <= 6.45; lon += 0.42) {
        const la = +lat.toFixed(3), lo = +lon.toFixed(3);
        if (MW.geo.pointInPolygon(lo, la, MW.WALLONIA) || MW.geo.distToPolygon(lo, la, MW.WALLONIA) < 0.2) out.push({ lat: la, lon: lo });
      }
    }
    return out;
  }

  function charger(onProgress) {
    if (etats) return Promise.resolve(true);
    if (enCours) return enCours;
    pts = grille();
    enCours = MW.weather.load(pts, onProgress, 'mw-meteo-carte-v2', 12).then((w) => {
      const t = w.todayIdx;
      etats = w.series.map((s) => {
        const o = {};
        MW.SPECIES.forEach((sp) => { const st = MW.model.state(sp, s, t); o[sp.id] = { key: st.key, label: st.label, detail: st.detail, w: POIDS[st.key] != null ? POIDS[st.key] : 0 }; });
        return o;
      });
      info = { fetchedAt: w.fetchedAt, ancien: !!w.ancien };
      return true;
    }).finally(() => { enCours = null; });
    return enCours;
  }

  // distance approchée en degrés « corrigés » (1° de longitude ≈ 0,64° de latitude en Wallonie)
  const d2 = (a, lat, lon) => { const dy = a.lat - lat, dx = (a.lon - lon) * 0.64; return dx * dx + dy * dy; };

  // poids 0-1 de l'espèce au point : moyenne des points voisins pondérée par l'inverse du carré de la distance
  function poids(id, lat, lon) {
    if (!etats) return 1;
    let s = 0, n = 0;
    for (let i = 0; i < pts.length; i++) {
      const d = d2(pts[i], lat, lon);
      if (d < 1e-8) return etats[i][id].w;
      if (d > 0.36) continue; // au-delà d'environ 60 km : ignoré
      const k = 1 / d; s += k * etats[i][id].w; n += k;
    }
    return n ? s / n : 1;
  }

  // état du point de grille le plus proche (bulle, résumé)
  function etatAu(id, lat, lon) {
    if (!etats) return null;
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = d2(pts[i], lat, lon); if (d < bd) { bd = d; best = i; } }
    return etats[best][id];
  }

  MW.meteoCarte = { charger, poids, etatAu, pret: () => !!etats, info: () => info };
})();
