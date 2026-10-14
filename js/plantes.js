/* Mode « Plantes et fruits » de la carte : liste des espèces, légende, couche de milieux par espèce, fiche en
   cinq étapes (Trouver, Reconnaître, Cueillir, Cuisiner, Conserver), états vides.
   Les données viennent uniquement de fichiers : data/plantes/index.json, data/plantes/<id>.json et
   data/plantes/tuiles/<id>/ (ajouter une espèce = ajouter des fichiers).
   Tant que MW.INTERRUPTEURS.plantes est faux (relecture botanique non faite), la version publique n'en charge
   rien et affiche « En préparation ». En local (localhost), les fichiers de test présents sont affichés avec
   leur bandeau, pour tester le mode complet. Jamais de plante de la famille de la carotte (Apiaceae). */
(function () {
  const MW = window.MW;
  const I = MW.INTERRUPTEURS || {};
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const ACTIF = I.plantes === true || LOCAL;
  const BASE = 'data/plantes/';
  const EN_PREPARATION = 'En préparation : les fiches plantes et fruits sont en cours de relecture par un botaniste.';
  const ETAPES = [['trouver', 'Trouver'], ['reconnaitre', 'Reconnaître'], ['cueillir', 'Cueillir'], ['cuisiner', 'Cuisiner'], ['conserver', 'Conserver']];
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignoré */ } };
  // garde-fou côté navigateur : famille de la carotte jamais affichée, famille obligatoire
  const admise = (e) => e && (e.famille === 'plante' || e.famille === 'fruit') && !/apiac|ombellif/i.test(e.famille_botanique || '');

  const E = { ctx: null, especes: [], tuiles: null, couche: null, coches: new Set(lire('mw-plantes-coches', [])), pret: null, actif: false };

  function charger() {
    if (E.pret) return E.pret;
    E.pret = (async () => {
      if (!ACTIF) return;
      try {
        const r = await fetch(BASE + 'index.json', { cache: 'no-store' });
        if (!r.ok) return;
        E.especes = ((await r.json()).especes || []).filter(admise);
        if (E.especes.some((e) => e.tuiles)) E.tuiles = await MW.tuiles.charger(BASE + 'tuiles/');
      } catch (e) { E.especes = []; }
    })();
    return E.pret;
  }
  const dispo = (e) => !!(E.tuiles && E.tuiles.especes.includes(e.id));
  const couches = () => (E.actif ? E.especes.filter((e) => E.coches.has(e.id) && dispo(e)).map((e) => ({ id: e.id, color: e.couleur, opacity: 0.75 })) : []);
  const nonRelue = (e) => e.relu_botaniste !== true;

  function legende() {
    const sel = E.especes.filter((e) => E.coches.has(e.id));
    if (!sel.length) return '<p class="muted small">Coche une espèce pour voir les milieux qui lui conviennent.</p>';
    const C = MW.CLASSES, cols = 'style="grid-template-columns:minmax(0,1.6fr) repeat(' + C.labels.length + ',1fr)"';
    return '<div class="lg"><div class="lg-row lg-head" ' + cols + '><span></span>' + C.labels.map((l) => '<span>' + esc(l) + '</span>').join('') + '</div>' +
      sel.map((e) => '<div class="lg-row" ' + cols + '><span class="lg-nm">' + esc(e.nom) + '</span>' + (dispo(e)
        ? MW.render.ramp(e.couleur).map((c, i) => '<i title="' + esc(C.labels[i]) + '" style="background:rgb(' + c.join(',') + ')"></i>').join('')
        : '<span class="lg-miss">pas encore de carte</span>') + '</div>').join('') +
      '</div><p class="muted small lg-note">Milieux qui conviennent à chaque espèce, comparés aux autres forêts wallonnes. Ce n’est pas une probabilité de trouvaille.</p>';
  }

  function section() {
    const el = document.getElementById('plantesSection');
    if (!el) return;
    if (!E.especes.length) {
      el.innerHTML = '<div class="vide-plantes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21V11"/><path d="M12 15c-4 0-6-3-6-7 4 0 6 3 6 7zM12 12c0-4 2-7 6-7 0 4-2 7-6 7z"/></svg>' +
        '<p><b>' + esc(EN_PREPARATION.split(' : ')[0]) + '</b> : ' + esc(EN_PREPARATION.split(' : ')[1]) + '</p>' +
        '<p class="muted small">En attendant, la carte des champignons, « Puis-je cueillir ici ? » et les battues restent disponibles : ces règles valent pour toute cueillette.</p></div>';
      return;
    }
    const tests = [...new Set(E.especes.filter(nonRelue).map((e) => e.bandeau || 'Non relu par un botaniste'))];
    el.innerHTML = tests.map((t) => '<p class="bandeau-test" role="note">' + esc(t) + '</p>').join('') +
      '<div class="row"><span class="k">Plantes et fruits</span></div>' +
      '<ul id="plantesListe" class="plantes-liste">' + E.especes.map((e) => '<li><label><input type="checkbox" data-id="' + esc(e.id) + '"' + (E.coches.has(e.id) ? ' checked' : '') + '>' +
        '<span class="dot" style="background:' + esc(e.couleur) + '"></span><span class="nm">' + esc(e.nom) + '</span><span class="fam">' + (e.famille === 'fruit' ? 'fruit' : 'plante') + '</span></label>' +
        '<div class="strip" title="Saison des fruits">' + MOIS.map((m, i) => '<i style="background:' + esc(e.couleur) + ';opacity:' + ((e.mois || []).includes(i + 1) ? 1 : 0.12) + '"></i>').join('') + '</div>' +
        '<div class="sub"><i>' + esc(e.latin) + '</i></div>' +
        '<button type="button" class="fiche-plante" data-id="' + esc(e.id) + '">Fiche : trouver, reconnaître, cueillir…</button></li>').join('') + '</ul>' +
      '<div id="plantesLegende" class="legend">' + legende() + '</div>';
    el.querySelectorAll('input[type=checkbox]').forEach((cb) => cb.addEventListener('change', () => {
      cb.checked ? E.coches.add(cb.dataset.id) : E.coches.delete(cb.dataset.id);
      ecrire('mw-plantes-coches', [...E.coches]);
      document.getElementById('plantesLegende').innerHTML = legende();
      if (E.couche) E.couche.redraw();
    }));
    el.querySelectorAll('.fiche-plante').forEach((b) => b.addEventListener('click', () => fiche(b.dataset.id)));
  }

  async function fiche(id) {
    const e = E.especes.find((x) => x.id === id);
    if (!e) return;
    E.ctx.panneau('<p class="surtitre">' + esc(e.famille === 'fruit' ? 'Fruit' : 'Plante') + '</p><p class="discret">Chargement de la fiche…</p>');
    let f;
    try { const r = await fetch(BASE + encodeURIComponent(id) + '.json'); if (!r.ok) throw new Error(); f = await r.json(); } catch (err) {
      return E.ctx.panneau('<p class="discret">Fiche indisponible pour l’instant.</p>');
    }
    if (!admise(f)) return E.ctx.panneau('<p class="discret">Fiche non affichée.</p>');
    E.ctx.panneau(
      (nonRelue(f) ? '<p class="bandeau-test" role="note">' + esc(f.bandeau || 'Non relu par un botaniste') + '</p>' : '') +
      '<p class="surtitre">' + esc(f.famille === 'fruit' ? 'Fruit' : 'Plante') + '</p><h2 class="fiche-titre">' + esc(f.nom) + '</h2><p class="discret"><i>' + esc(f.latin) + '</i></p>' +
      '<ul class="reperes">' + ETAPES.map(([k, l]) => '<li><a href="#pl-' + k + '">' + l + '</a></li>').join('') + '</ul>' +
      '<details class="securite"><summary>Sécurité : sosies et Centre Antipoisons</summary><div><p><b>Confusions possibles</b> : ' + esc(f.sosies || 'à préciser') + '</p>' +
      '<p>Musette n’identifie rien : chaque fruit doit être reconnu avec certitude. Intoxication : Centre Antipoisons <a href="tel:070245245">070 245 245</a> (24 h/24).</p></div></details>' +
      ETAPES.map(([k, l]) => '<section class="etape" id="pl-' + k + '"><h3>' + l + '</h3><p>' + esc((f.etapes || {})[k] || 'À compléter.') + '</p></section>').join('') +
      '<p class="petit discret" style="margin-top:14px"><a href="droit.html">Le droit de cueillir</a> · <a href="avant-de-manger.html">Avant de manger</a></p>');
  }

  async function activer(on) {
    E.actif = on;
    await charger();
    section();
    if (on && E.tuiles && !E.couche) E.couche = MW.tuiles.create(E.tuiles, couches, E.ctx.getMode).addTo(E.ctx.map);
    if (E.couche) E.couche.redraw();
  }

  // lignes « Milieu favorable à… » au point (popup et fiche « Ici ? »)
  async function lignes(lat, lng) {
    await charger();
    if (!E.especes.length) return '<p class="muted">' + esc(EN_PREPARATION) + '</p>';
    const rows = await Promise.all(E.especes.map(async (e) => {
      const v = dispo(e) ? await MW.tuiles.valueAt(E.tuiles, e.id, lat, lng) : null;
      const k = v == null ? -1 : MW.render.classOf(v);
      const txt = !dispo(e) ? '<span class="muted">pas encore de carte</span>' : v == null ? '<span class="muted">hors zone</span>' : !(v > 0) ? 'hors forêt'
        : (k < 0 ? 'en dessous de « ' + MW.CLASSES.labels[0] + ' »' : '<b>' + MW.CLASSES.labels[k] + '</b>') + ' · mieux que ' + Math.round(v * 100) + ' % des forêts';
      return '<tr><td><i class="dot" style="background:' + esc(e.couleur) + '"></i>' + esc(e.nom) + '</td><td>' + txt + '</td></tr>';
    }));
    const test = E.especes.some(nonRelue);
    return '<table class="pop">' + rows.join('') + '</table><small>Milieu seulement. Ceci n’identifie aucune plante.' + (test ? ' Contenu non relu par un botaniste.' : '') + '</small>';
  }

  MW.plantes = { init(ctx) { E.ctx = ctx; }, activer, lignes, EN_PREPARATION };
})();
