/* Mode « Météo de cette année » de la carte.
   La météo des derniers mois est lue à une grille d'une trentaine de points (Open-Meteo, usage non commercial, cache
   3 h). Deux usages :
   - sec(lat, lon) : sécheresse de fond 0-1 (bilan pluie - évaporation sur 90 jours comparé à la normale, voir
     MW.SECHERESSE), la même pour toutes les espèces, interpolée en continu. La carte s'en sert pour baisser
     progressivement le score et ne griser que les cas extrêmes. La saison, le froid ou le gel ne grisent jamais.
   - etatAu(id, lat, lon) : état de l'espèce au point de grille le plus proche (même modèle que le bulletin), pour
     le résumé et les bulles. Résolution d'environ 30 km : une tendance régionale, pas un bois précis. */
(function () {
  const MW = window.MW;
  // couleur de pastille par état (fiche « Ici ? ») : 1 = vert, 0.5 = ambre, 0 = neutre
  const POIDS = { pousse: 1, prepare: 0.85, moyen: 0.6, sec: 0, froid: 0, chaud: 0, gel: 0, defav: 0.2, hors: 0 };
  let pts = null, etats = null, secs = null, info = null, enCours = null;

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
      secs = w.series.map((s) => MW.model.secheresse(s, t).sec);
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

  // sécheresse 0-1 au point : moyenne des points voisins pondérée par l'inverse du carré de la distance (valeur
  // continue : pas de moyenne de catégories, donc pas d'effet de seuil qui grise une région entière)
  function sec(lat, lon) {
    if (!secs) return 0;
    let s = 0, n = 0;
    for (let i = 0; i < pts.length; i++) {
      const d = d2(pts[i], lat, lon);
      if (d < 1e-8) return secs[i];
      if (d > 0.36) continue; // au-delà d'environ 60 km : ignoré
      const k = 1 / d; s += k * secs[i]; n += k;
    }
    return n ? s / n : 0;
  }

  // état du point de grille le plus proche (bulle, résumé)
  function etatAu(id, lat, lon) {
    if (!etats) return null;
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = d2(pts[i], lat, lon); if (d < bd) { bd = d; best = i; } }
    return etats[best][id];
  }

  // part des points de grille où l'espèce est dans chaque état (tests et comptes rendus)
  function bilan() {
    if (!etats) return null;
    const out = { secheresse: secs.filter((x) => x >= MW.SECHERESSE.SEUIL_GRIS).length + '/' + secs.length };
    MW.SPECIES.forEach((sp) => { const c = {}; etats.forEach((e) => { c[e[sp.id].key] = (c[e[sp.id].key] || 0) + 1; }); out[sp.id] = c; });
    return out;
  }

  MW.meteoCarte = { charger, sec, etatAu, bilan, pret: () => !!etats, info: () => info };
})();
