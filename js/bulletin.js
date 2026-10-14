/* Bulletin des pousses par massif : météo Open-Meteo (usage non commercial) + modèle de fenêtre (js/model.js)
   + nombre de territoires fermés pour la chasse le week-end (js/droit.js). Indicatif, confiance faible tant que le
   modèle n'est pas calibré avec les retours de terrain.
   Page Bulletin : massifs triés du plus proche (position arrondie au kilomètre, gardée sur le téléphone), en accordéon,
   et bascule Champignons / Plantes et fruits (même réglage que la carte : mw-mode-carte). */
(function (root) {
  const MW = (root.MW = root.MW || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const stock = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignoré */ } }
  };
  const FEU = { pousse: ['vert', 'Fenêtre favorable'], prepare: ['orange', 'Ça se prépare'], moyen: ['orange', 'Moyen'],
    sec: ['gris', 'Trop sec'], froid: ['gris', 'Trop froid'], chaud: ['gris', 'Trop chaud'], gel: ['gris', 'Gelé'], defav: ['gris', 'Défavorable'], hors: ['gris', 'Hors saison'] };
  const nomCourt = { cepe: 'cèpes', girolle: 'girolles', morille: 'morilles', trompette: 'trompettes', chanterelle: 'chanterelles en tube', pied: 'pieds de mouton' };
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const somme = (a, i, j) => { let s = 0; for (let k = Math.max(0, i); k <= Math.min(a.length - 1, j); k++) s += a[k] || 0; return s; };
  const moyenne = (a, i, j) => { let s = 0, n = 0; for (let k = Math.max(0, i); k <= Math.min(a.length - 1, j); k++) { s += a[k]; n++; } return n ? s / n : 0; };
  const liste = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1]);

  let massifsP = null;
  const massifs = () => (massifsP = massifsP || fetch('data/massifs.json').then((r) => r.json()).then((j) => j.massifs));

  // distance à vol d'oiseau (km)
  function km(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  // position arrondie à 0,01° (environ 1 km), gardée sur ce téléphone seulement ; demandée seulement sur un geste,
  // ou relue sans question quand le navigateur l'autorise déjà
  function lirePosition() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => {
        const v = { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 };
        stock.set('mw-position', v); res(v);
      }, () => res(null), { maximumAge: 600000, timeout: 12000 });
    });
  }
  async function position() {
    const memo = stock.get('mw-position', null);
    try {
      const p = await navigator.permissions.query({ name: 'geolocation' });
      if (p.state === 'granted') return (await lirePosition()) || memo;
      if (p.state === 'denied') return null;
    } catch (e) { /* API absente : on garde la dernière position connue */ }
    return memo;
  }

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

  // résumé d'une ligne, visible accordéon fermé : le meilleur état du massif et les espèces concernées
  function resume(etats) {
    for (const k of ['pousse', 'prepare', 'moyen']) {
      const l = etats.filter((e) => e.st.key === k);
      if (l.length) return { feu: FEU[k], texte: liste(l.map((e) => nomCourt[e.sp.id])) };
    }
    const saison = etats.filter((e) => e.st.key !== 'hors');
    if (!saison.length) return { feu: FEU.hors, texte: 'rien à attendre' };
    const compte = {};
    saison.forEach((e) => { compte[e.st.key] = (compte[e.st.key] || 0) + 1; });
    const k = Object.keys(compte).sort((a, b) => compte[b] - compte[a])[0];
    return { feu: FEU[k] || FEU.defav, texte: k === 'sec' ? 'il manque de la pluie' : k === 'froid' ? 'trop frais pour l’instant' : 'rien d’évident' };
  }

  function etatPlante(sp, m) {
    const suiv = (m % 12) + 1, prec = ((m + 10) % 12) + 1, mois = sp.mois || [];
    if (mois.includes(m)) return mois.includes(suiv) ? ['vert', 'En saison', 0] : ['vert', 'Dernières semaines', 1];
    if (mois.includes(suiv)) return ['orange', 'Bientôt', 2];
    // plages de mois lisibles : « mars à mai, septembre »
    const plages = []; let debut = null;
    mois.slice().sort((a, b) => a - b).forEach((x, i, t) => {
      if (debut === null) debut = x;
      if (t[i + 1] !== x + 1) { plages.push(debut === x ? MOIS[x - 1] : MOIS[debut - 1] + ' à ' + MOIS[x - 1]); debut = null; }
    });
    return ['gris', plages.join(', ') || 'saison à préciser', 3 + (mois.includes(prec) ? 0 : 1)];
  }

  let plantesP = null;
  function plantes() {
    const I = MW.INTERRUPTEURS || {}, LOCAL = /^(localhost|127\.)/.test(location.hostname);
    if (!(I.plantes === true || LOCAL)) return Promise.resolve(null);
    return (plantesP = plantesP || fetch('data/plantes/index.json').then((r) => (r.ok ? r.json() : null))
      .then((j) => (j ? j.especes.filter((e) => e.famille_botanique !== 'Apiaceae') : null)).catch(() => null));
  }

  const SQUELETTE = '<p class="discret b-charge" role="status">Chargement du bulletin…</p>' +
    '<div class="b-liste" aria-hidden="true">' + '<div class="b-squelette"><i></i><i></i></div>'.repeat(4) + '</div>';

  // el : conteneur ; opts.compact = aperçu (accueil) ; opts.onProgress
  async function rendre(el, opts) {
    opts = opts || {};
    el.innerHTML = opts.compact ? '<p class="discret">Chargement du bulletin (météo des massifs)…</p>' : SQUELETTE;
    const charge = el.querySelector('.b-charge');
    const progres = (p) => { if (opts.onProgress) opts.onProgress(p); if (charge) charge.textContent = 'Chargement du bulletin… ' + Math.round(p * 100) + ' %'; };
    let ms, w;
    const lent = setTimeout(() => { if (charge && charge.isConnected) charge.textContent = 'La météo met du temps à répondre aujourd’hui. Encore un instant…'; }, 10000);
    try {
      ms = await massifs();
      w = await MW.weather.load(ms.map((m) => ({ lat: m.lat, lon: m.lon })), progres, 'sb-bulletin-v2', 6);
    } catch (e) {
      clearTimeout(lent);
      el.innerHTML = '<div class="encadre note b-erreur"><p><b>La météo ne répond pas pour l’instant.</b> Vérifie ta connexion, puis réessaie.</p>' +
        '<button type="button" class="btn plein">Réessayer</button></div>';
      el.querySelector('button').onclick = () => rendre(el, opts);
      return null;
    }
    clearTimeout(lent);
    const t = w.todayIdx, we = MW.droit ? MW.droit.prochainWeekEnd() : [];
    const res = ms.map((m, i) => {
      const s = w.series[i];
      const etats = MW.SPECIES.map((sp) => ({ sp, st: MW.model.state(sp, s, t) }));
      return { m, s, etats, pluie26: somme(s.precip, t - 25, t), t20: moyenne(s.tmean, t - 19, t), prevu7: somme(s.precip, t + 1, t + 7), phrase: phrase(etats), resume: resume(etats) };
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

    const flore = await plantes();
    let mode = flore && stock.get('mw-mode-carte', 'champignons') === 'plantes' ? 'plantes' : 'champignons';
    let pos = await position();

    el.innerHTML = (flore ? '<div class="bascule b-mode" role="group" aria-label="Je cueille">' +
        '<button type="button" data-mode="champignons">Champignons</button><button type="button" data-mode="plantes">Plantes et fruits</button></div>' : '') +
      '<div class="b-tri" id="b-tri" aria-live="polite"></div><div id="b-vue"></div>' +
      '<p class="releve b-maj">Mise à jour ' + esc(maj) + (w.ancien ? ' : la météo ne répond pas, c’est le dernier bulletin enregistré sur ce téléphone' : w.fromCache ? ' (en cache)' : '') + ' · météo Open-Meteo · un point de calcul par massif · confiance faible</p>';
    const tri = el.querySelector('#b-tri'), vue = el.querySelector('#b-vue');

    function lignesTri() {
      if (pos) {
        tri.innerHTML = '<p>Du plus proche au plus loin, à vol d’oiseau depuis ta position. Elle reste sur ce téléphone.</p>' +
          '<button type="button" class="btn ligne b-pos">Actualiser</button>';
      } else {
        tri.innerHTML = '<p>Pour voir les massifs du plus proche au plus loin, Musette a besoin de ta position. Elle reste sur ce téléphone.</p>' +
          '<button type="button" class="btn signal b-pos">Trier autour de moi</button>';
      }
      tri.querySelector('.b-pos').onclick = async (e) => {
        const b = e.currentTarget; b.disabled = true; b.textContent = 'Position en cours…';
        const p = await lirePosition();
        if (p) { pos = p; dessiner(); }
        else { lignesTri(); tri.insertAdjacentHTML('beforeend', '<p class="b-refus">Position indisponible. Autorise-la dans les réglages du navigateur, ou garde l’ordre par région.</p>'); }
      };
    }

    function ordre(liste) {
      const l = liste.map((x) => ({ x, d: pos ? km(pos, x.m) : null }));
      if (pos) l.sort((a, b) => a.d - b.d);
      return l;
    }
    const kmTexte = (d) => (d == null ? '' : (d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)) + ' km');

    function vueChampignons() {
      const l = ordre(res);
      vue.innerHTML = '<div class="b-liste">' + l.map(({ x: r, d }, i) =>
        '<details class="massif" id="' + esc(r.m.id) + '"' + (i === 0 ? ' open' : '') + '>' +
          '<summary><span class="m-nom">' + esc(r.m.nom) + '<small>' + esc(r.m.region) + '</small></span>' +
            '<span class="m-km">' + kmTexte(d) + '</span>' +
            '<span class="m-resume"><span class="feu ' + r.resume.feu[0] + '">' + r.resume.feu[1] + '</span>' + esc(r.resume.texte) + '</span></summary>' +
          '<div class="m-dedans">' +
            '<p class="m-phrase">' + esc(r.phrase) + '</p>' +
            '<div class="especes-etat">' + r.etats.map((e) => '<div><span><span class="point" style="background:' + e.sp.color + '"></span>' + esc(e.sp.name) +
              (e.st.detail ? '<small>' + esc(e.st.detail) + '</small>' : '') + '</span><span class="feu ' + FEU[e.st.key][0] + '">' + FEU[e.st.key][1] + '</span></div>').join('') + '</div>' +
            '<p class="releve">Pluie sur 26 jours <b>' + Math.round(r.pluie26) + ' mm</b> · moyenne sur 20 jours <b>' + r.t20.toFixed(1).replace('.', ',') + ' °C</b> · prévu cette semaine <b>' + Math.round(r.prevu7) + ' mm</b></p>' +
            '<p class="battues-massif" data-massif="' + esc(r.m.id) + '">Battues ce week-end : recherche…</p>' +
            '<div class="m-liens"><a href="carte.html#12/' + r.m.lat + '/' + r.m.lon + '">Voir sur la carte</a><a href="battues.html?massif=' + esc(r.m.id) + '">Calendrier des battues</a></div>' +
          '</div></details>').join('') + '</div>';
      // battues du week-end : interrogées à l'ouverture d'un massif seulement (emprise ~ 30 x 30 km autour du point)
      vue.querySelectorAll('details.massif').forEach((det) => {
        const charger = async () => {
          const p = det.querySelector('.battues-massif'); if (!p || p.dataset.fait || !MW.droit || !we.length) return;
          p.dataset.fait = '1';
          const m = res.find((r) => r.m.id === det.id).m;
          try {
            const n = await MW.droit.compterFermetures(we, [m.lon - 0.21, m.lat - 0.135, m.lon + 0.21, m.lat + 0.135]);
            p.innerHTML = n > 0 ? '<b>' + n + ' territoire' + (n > 1 ? 's' : '') + ' fermé' + (n > 1 ? 's' : '') + ' pour la chasse ce week-end</b> autour du massif' : 'Aucune battue annoncée ce week-end autour du massif';
            p.classList.toggle('ferme', n > 0);
          } catch (e) { p.textContent = 'Battues ce week-end : données indisponibles'; }
        };
        det.addEventListener('toggle', () => { if (det.open) charger(); });
        if (det.open) charger();
      });
    }

    function vuePlantes() {
      const m = new Date().getMonth() + 1;
      const especes = flore.map((sp) => ({ sp, e: etatPlante(sp, m) })).sort((a, b) => a.e[2] - b.e[2]);
      const l = ordre(res);
      vue.innerHTML = '<p class="discret b-note">Pas de modèle météo pour les plantes et les fruits : la saison, et les milieux favorables sur la carte. Les fiches attendent la relecture d’un botaniste.</p>' +
        '<h2 class="b-titre">En ' + MOIS[m - 1] + '</h2>' +
        (especes.some((x) => x.e[2] <= 2) ? '' : '<p class="discret">Rien en pleine saison ce mois-ci parmi les espèces suivies. Voici quand revenir.</p>') +
        '<div class="b-saison">' + especes.map(({ sp, e }) => '<a href="especes.html#' + esc(sp.id) + '"><span><span class="point" style="background:' + esc(sp.couleur) + '"></span>' + esc(sp.nom) + '</span>' +
          '<span class="feu ' + e[0] + '">' + esc(e[1]) + '</span></a>').join('') + '</div>' +
        '<h2 class="b-titre">Les massifs</h2>' +
        '<div class="b-liste">' + l.map(({ x: r, d }) => '<a class="massif-lien" href="carte.html?mode=plantes#12/' + r.m.lat + '/' + r.m.lon + '">' +
          '<span class="m-nom">' + esc(r.m.nom) + '<small>' + esc(r.m.region) + '</small></span><span class="m-km">' + kmTexte(d) + '</span>' +
          '<span class="m-resume">Voir les milieux favorables sur la carte</span></a>').join('') + '</div>';
    }

    function dessiner() {
      el.querySelectorAll('.b-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      lignesTri();
      if (mode === 'plantes' && flore) vuePlantes(); else vueChampignons();
    }
    el.querySelectorAll('.b-mode button').forEach((b) => b.addEventListener('click', () => {
      if (mode === b.dataset.mode) return;
      mode = b.dataset.mode; stock.set('mw-mode-carte', mode); dessiner();
    }));
    dessiner();
    return res;
  }

  MW.bulletin = { rendre, massifs };
})(typeof window !== 'undefined' ? window : globalThis);
