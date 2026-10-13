/* Bulletin des pousses par massif : météo Open-Meteo (usage non commercial) + modèle de fenêtre (js/model.js)
   + nombre de territoires fermés pour la chasse le week-end (js/droit.js). Indicatif, confiance faible tant que le
   modèle n'est pas calibré avec les retours de terrain. */
(function (root) {
  const MW = (root.MW = root.MW || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FEU = { pousse: ['vert', 'Fenêtre favorable'], prepare: ['orange', 'Ça se prépare'], moyen: ['orange', 'Moyen'],
    sec: ['gris', 'Trop sec'], froid: ['gris', 'Trop froid'], chaud: ['gris', 'Trop chaud'], gel: ['gris', 'Gelé'], defav: ['gris', 'Défavorable'], hors: ['gris', 'Hors saison'] };
  const nomCourt = { cepe: 'cèpes', girolle: 'girolles', morille: 'morilles', trompette: 'trompettes', chanterelle: 'chanterelles en tube', pied: 'pieds de mouton' };
  const somme = (a, i, j) => { let s = 0; for (let k = Math.max(0, i); k <= Math.min(a.length - 1, j); k++) s += a[k] || 0; return s; };
  const moyenne = (a, i, j) => { let s = 0, n = 0; for (let k = Math.max(0, i); k <= Math.min(a.length - 1, j); k++) { s += a[k]; n++; } return n ? s / n : 0; };
  const liste = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1]);

  let massifsP = null;
  const massifs = () => (massifsP = massifsP || fetch('data/massifs.json').then((r) => r.json()).then((j) => j.massifs));

  function phrase(etats) {
    const fav = etats.filter((e) => e.st.key === 'pousse').map((e) => nomCourt[e.sp.id]);
    const prep = etats.filter((e) => e.st.key === 'prepare');
    const saison = etats.filter((e) => e.st.key !== 'hors');
    if (fav.length) return 'Les ' + liste(fav) + ' ont une fenêtre favorable.';
    if (prep.length) return 'Ça se prépare pour les ' + liste(prep.map((e) => nomCourt[e.sp.id])) + (prep[0].st.detail ? ' : ' + prep[0].st.detail + '.' : '.');
    if (!saison.length) return 'Hors saison pour les espèces suivies.';
    const raisons = saison.map((e) => e.st.key);
    if (raisons.every((k) => k === 'sec')) return 'Encore sec : patience, il manque de la pluie.';
    if (raisons.includes('gel')) return 'Le gel a figé les pousses.';
    if (raisons.every((k) => k === 'froid' || k === 'sec')) return 'Trop frais ou trop sec pour l’instant.';
    return 'Conditions moyennes : rien d’évident cette semaine.';
  }

  // el : conteneur ; opts.compact = aperçu (accueil) ; opts.onProgress
  async function rendre(el, opts) {
    opts = opts || {};
    el.innerHTML = '<p class="discret">Chargement du bulletin (météo des massifs)…</p>';
    let ms, w;
    try {
      ms = await massifs();
      w = await MW.weather.load(ms.map((m) => ({ lat: m.lat, lon: m.lon })), opts.onProgress, 'sb-bulletin-v2');
    } catch (e) {
      el.innerHTML = '<div class="encadre note"><p>Bulletin indisponible pour l’instant (' + esc(e.message) + '). Réessaie un peu plus tard.</p></div>';
      return null;
    }
    const t = w.todayIdx, we = MW.droit ? MW.droit.prochainWeekEnd() : [];
    const res = ms.map((m, i) => {
      const s = w.series[i];
      const etats = MW.SPECIES.map((sp) => ({ sp, st: MW.model.state(sp, s, t) }));
      return { m, s, etats, pluie26: somme(s.precip, t - 25, t), t20: moyenne(s.tmean, t - 19, t), prevu7: somme(s.precip, t + 1, t + 7), phrase: phrase(etats) };
    });
    const maj = new Date(w.fetchedAt).toLocaleString('fr-BE', { weekday: 'long', hour: '2-digit', minute: '2-digit' });

    if (opts.compact) {
      const top = [];
      res.forEach((r) => r.etats.forEach((e) => { if (e.st.key === 'pousse' || e.st.key === 'prepare') top.push({ r, e }); }));
      top.sort((a, b) => (a.e.st.key === 'pousse' ? 0 : 1) - (b.e.st.key === 'pousse' ? 0 : 1));
      el.innerHTML = top.length
        ? '<div class="especes-etat">' + top.slice(0, 6).map(({ r, e }) => '<div><span><span class="point" style="background:' + e.sp.color + '"></span>' + esc(r.m.nom) + ' · ' + esc(e.sp.name) +
            (e.st.detail ? '<small>' + esc(e.st.detail) + '</small>' : '') + '</span><span class="feu ' + FEU[e.st.key][0] + '">' + FEU[e.st.key][1] + '</span></div>').join('') + '</div>'
        : '<p>Rien d’évident cette semaine dans les massifs suivis. Une poussée suit une bonne pluie cumulée et une à deux semaines de douceur.</p>';
      el.insertAdjacentHTML('beforeend', '<p class="releve">Mise à jour ' + esc(maj) + ' · Open-Meteo · confiance faible</p>');
      return res;
    }

    el.innerHTML = '<div class="grille deux">' + res.map((r) =>
      '<article class="carte massif" id="' + esc(r.m.id) + '">' +
        '<header><h3>' + esc(r.m.nom) + '</h3><span class="releve">' + esc(r.m.region) + '</span></header>' +
        '<p><b>' + esc(r.phrase) + '</b></p>' +
        '<div class="especes-etat">' + r.etats.map((e) => '<div><span><span class="point" style="background:' + e.sp.color + '"></span>' + esc(e.sp.name) +
          (e.st.detail ? '<small>' + esc(e.st.detail) + '</small>' : '') + '</span><span class="feu ' + FEU[e.st.key][0] + '">' + FEU[e.st.key][1] + '</span></div>').join('') + '</div>' +
        '<p class="releve">Pluie récente <b>' + Math.round(r.pluie26) + ' mm</b> · température moyenne <b>' + r.t20.toFixed(1).replace('.', ',') + ' °C</b> · prévu cette semaine <b>' + Math.round(r.prevu7) + ' mm</b></p>' +
        '<p class="battues-massif releve" data-massif="' + esc(r.m.id) + '">Battues ce week-end : …</p>' +
        '<div class="btns" style="margin-top:4px"><a class="btn ligne" href="carte.html#12/' + r.m.lat + '/' + r.m.lon + '">Voir sur la carte</a><a class="btn ligne" href="battues.html?massif=' + esc(r.m.id) + '">Calendrier des battues</a></div>' +
      '</article>').join('') + '</div>' +
      '<p class="releve" style="margin-top:16px">Mise à jour ' + esc(maj) + (w.fromCache ? ' (en cache)' : '') + ' · météo Open-Meteo · un point de calcul par massif · confiance faible</p>';

    // battues du week-end par massif (emprise ~ 30 x 30 km autour du point)
    if (MW.droit && we.length) {
      res.forEach(async (r) => {
        const p = el.querySelector('.battues-massif[data-massif="' + r.m.id + '"]');
        try {
          const n = await MW.droit.compterFermetures(we, [r.m.lon - 0.21, r.m.lat - 0.135, r.m.lon + 0.21, r.m.lat + 0.135]);
          p.innerHTML = 'Battues ce week-end : <b>' + n + ' territoire' + (n > 1 ? 's' : '') + ' fermé' + (n > 1 ? 's' : '') + '</b> autour du massif';
          if (n > 0) p.style.color = 'var(--non)';
        } catch (e) { p.textContent = 'Battues ce week-end : données indisponibles'; }
      });
    }
    return res;
  }

  MW.bulletin = { rendre, massifs };
})(typeof window !== 'undefined' ? window : globalThis);
