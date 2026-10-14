/* Interface de la carte : potentiel de site (et météo si MW.FEATURES.weather), zones fermées pour la chasse
   (hachures + alerte), « Puis-je cueillir ici ? » + « Pourquoi ici ? », couches wallonnes, coins.
   Les forêts privées ne sont jamais masquées : on informe (à qui demander). Seules les battues ferment. */
(function () {
  const MW = window.MW, B = MW.BBOX, WX = MW.FEATURES.weather, D = MW.droit;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignoré */ } }
  };
  const STATE_LABEL = { pousse: 'pousse', prepare: 'prépare', sec: 'sec', froid: 'froid', chaud: 'chaud', gel: 'gel', hors: 'hors saison', moyen: 'moyen', defav: 'défavorable' };
  const mobile = window.matchMedia('(max-width: 860px)');

  const S = {
    day: 0, mode: 'dominant', opacity: 0.8,
    checked: new Set(store.get('mw-checked', ['cepe'])),
    grid: null, h: null, series: null, todayIdx: 0,
    potentials: {}, potentialsReady: false, opac: store.get('mw-opacity', {}), overlay: null, layers: [], wms: store.get('mw-wms', []),
    tiles: null, tileLayer: null, available: new Set(), dessus: store.get('mw-dessus', true),
    addMode: false, coins: store.get('mw-coins', []), coinMarkers: [], placeMarker: null,
    jour: D.todayISO(), ferm: null, fermErr: false, fermLayer: null, fermTok: 0, ficheTok: 0, ficheMarker: null, moi: null
  };
  const opacityOf = (sp) => (S.opac[sp.id] != null ? S.opac[sp.id] : 0.75);
  // potentiel disponible pour l'espèce : tuiles (mode potentiel) ou image unique (mode météo)
  const hasData = (sp) => (WX ? !!S.potentials[sp.id] : S.available.has(sp.id));

  /* ---------- carte ---------- */
  const map = L.map('map', { zoomControl: false, minZoom: 7 }).fitBounds([[B.south, B.west], [B.north, B.east]]);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  // position dans l'URL (#zoom/lat/lon) : lien partageable, rechargement au même endroit
  const h0 = /^#(\d+)\/(-?[\d.]+)\/(-?[\d.]+)$/.exec(location.hash);
  if (h0) map.setView([+h0[2], +h0[3]], +h0[1]);
  map.on('moveend', () => { const c = map.getCenter(); history.replaceState(null, '', '#' + map.getZoom() + '/' + c.lat.toFixed(5) + '/' + c.lng.toFixed(5)); });
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap' });
  // CartoWeb (IGN belge) : zooms 7-17 en Web Mercator, emprise Belgique
  const CW = 'https://cartoweb.wmts.ngi.be/1.0.0/', cwOpts = { minZoom: 7, maxNativeZoom: 17, maxZoom: 19, attribution: '© IGN/NGI CartoWeb', bounds: [[49.45, 2.51], [51.51, 6.41]] };
  const ign = L.tileLayer(CW + 'topo/default/3857/{z}/{y}/{x}.png', cwOpts);
  osm.addTo(map);
  L.control.layers({ 'Carte OSM': osm, 'Carte IGN (CartoWeb)': ign, 'Relief (OpenTopoMap)': topo }, null, { position: 'topright' }).addTo(map);
  L.polygon(MW.WALLONIA.map((p) => [p[1], p[0]]), { color: '#3f5b3c', weight: 1, dashArray: '4 4', fill: false, interactive: false }).addTo(map);
  map.createPane('heat'); map.getPane('heat').style.zIndex = 450; map.getPane('heat').style.pointerEvents = 'none';
  // zones fermées pour la chasse : au-dessus du potentiel, qu'elles masquent en partie
  map.createPane('fermetures'); map.getPane('fermetures').style.zIndex = 455; map.getPane('fermetures').style.pointerEvents = 'none';
  // routes, cours d'eau et noms (fond transparent) au-dessus du potentiel
  map.createPane('dessus'); map.getPane('dessus').style.zIndex = 460; map.getPane('dessus').style.pointerEvents = 'none';
  const dessus = L.tileLayer(CW + 'overlay/default/3857/{z}/{y}/{x}.png', Object.assign({ pane: 'dessus' }, cwOpts));
  const setDessus = (on) => { S.dessus = on; store.set('mw-dessus', on); on ? dessus.addTo(map) : map.removeLayer(dessus); };
  $('#dessus').checked = S.dessus;
  $('#dessus').addEventListener('change', (e) => setDessus(e.target.checked));
  setDessus(S.dessus);

  // rendu SVG des zones fermées, avec un motif de hachures rouges sur voile clair
  const rendF = L.svg({ pane: 'fermetures', padding: 0.5 });
  map.addLayer(rendF);
  (function hachures() {
    const NS = 'http://www.w3.org/2000/svg', svg = rendF._container;
    const defs = document.createElementNS(NS, 'defs'), pat = document.createElementNS(NS, 'pattern');
    pat.setAttribute('id', 'hachures'); pat.setAttribute('width', '10'); pat.setAttribute('height', '10');
    pat.setAttribute('patternUnits', 'userSpaceOnUse'); pat.setAttribute('patternTransform', 'rotate(45)');
    const fond = document.createElementNS(NS, 'rect');
    fond.setAttribute('width', '10'); fond.setAttribute('height', '10'); fond.setAttribute('fill', '#ffffff'); fond.setAttribute('fill-opacity', '0.55');
    const trait = document.createElementNS(NS, 'rect');
    trait.setAttribute('width', '3.5'); trait.setAttribute('height', '10'); trait.setAttribute('fill', '#a5301d'); trait.setAttribute('fill-opacity', '0.85');
    pat.appendChild(fond); pat.appendChild(trait); defs.appendChild(pat); svg.insertBefore(defs, svg.firstChild);
  })();

  /* ---------- panneau ---------- */
  const panel = $('#panel');
  function replier(on) {
    panel.classList.toggle('collapsed', on);
    $('#toggle').setAttribute('aria-expanded', String(!on));
    $('#toggleTxt').textContent = on ? 'Réglages' : 'Replier';
  }
  $('#toggle').onclick = () => replier(!panel.classList.contains('collapsed'));
  if (mobile.matches) replier(true);

  /* ---------- liste des espèces ---------- */
  const list = $('#species');
  MW.SPECIES.forEach((sp) => {
    const li = document.createElement('li');
    li.innerHTML = '<label><input type="checkbox" data-id="' + sp.id + '"><span class="dot" style="background:' + sp.color + '"></span>' +
      '<span class="nm">' + esc(sp.name) + '</span><span class="chip" id="chip-' + sp.id + '"' + (WX ? '' : ' hidden') + '>…</span></label>' +
      '<div class="strip" title="Saison (poids du calendrier, janv. → déc.)">' +
      MW.model.monthWeights(sp).map((w) => '<i style="background:' + sp.color + ';opacity:' + (0.12 + 0.88 * w) + '"></i>').join('') + '</div>' +
      '<div class="sub" id="sub-' + sp.id + '">' + esc(sp.hosts) + '</div>' +
      (WX ? '' : '<div class="op"><span class="k">Opacité</span><input type="range" min="0.2" max="1" step="0.05" value="' + opacityOf(sp) + '" aria-label="Opacité ' + esc(sp.name) + '"><span class="mono" id="op-' + sp.id + '">' + Math.round(opacityOf(sp) * 100) + ' %</span></div>');
    list.appendChild(li);
    const cb = li.querySelector('input[type=checkbox]'); cb.checked = S.checked.has(sp.id);
    cb.addEventListener('change', () => { cb.checked ? S.checked.add(sp.id) : S.checked.delete(sp.id); store.set('mw-checked', [...S.checked]); draw(); });
    const op = li.querySelector('input[type=range]');
    if (op) op.addEventListener('input', () => {
      S.opac[sp.id] = +op.value; store.set('mw-opacity', S.opac);
      $('#op-' + sp.id).textContent = Math.round(op.value * 100) + ' %';
      scheduleDraw();
    });
  });
  $('#weatherSection').hidden = !WX;
  if (WX) $('#speciesTitle').textContent = 'Espèces';
  const setAll = (on) => { list.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = on; on ? S.checked.add(c.dataset.id) : S.checked.delete(c.dataset.id); }); store.set('mw-checked', [...S.checked]); draw(); };
  $('#all').onclick = () => setAll(true);
  $('#none').onclick = () => setAll(false);
  document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => { S.mode = r.value; draw(); }));
  $('#day').addEventListener('input', (e) => { S.day = +e.target.value; updateDayLabel(); draw(); });

  function dateStr(d) {
    if (!S.series) return '';
    const t = S.series[0].time[S.todayIdx + d];
    return t ? new Date(t + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  }
  function updateDayLabel() {
    const d = S.day;
    $('#dayLabel').textContent = (d === 0 ? "Aujourd'hui" : d < 0 ? 'Il y a ' + -d + ' j' : 'Prévision +' + d + ' j') + (S.series ? ' · ' + dateStr(d) : '');
  }

  /* ---------- calcul + dessin ---------- */
  function valuesFor(sp, d) {
    const t = S.todayIdx + d;
    return S.series.map((s) => MW.model.evaluate(sp, s, t).I);
  }

  function refreshChips() {
    MW.SPECIES.forEach((sp) => {
      const t = S.todayIdx + S.day, count = {};
      const sts = S.series.map((s) => MW.model.state(sp, s, t));
      sts.forEach((x) => { count[x.key] = (count[x.key] || 0) + 1; });
      const key = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      const ex = sts.find((x) => x.key === key);
      const chip = $('#chip-' + sp.id);
      chip.textContent = STATE_LABEL[key]; chip.className = 'chip ' + key;
      $('#sub-' + sp.id).textContent = ex.detail || sp.hosts;
    });
  }

  let drawPending = false;
  function scheduleDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => { drawPending = false; draw(); });
  }

  // espèces cochées qui ont des tuiles (mode potentiel) ; rien en mode « Plantes et fruits »
  const tileLayers = () => S.modeCarte === 'plantes' ? [] : MW.SPECIES.filter((sp) => S.checked.has(sp.id) && S.available.has(sp.id))
    .map((sp) => ({ id: sp.id, color: sp.color, opacity: opacityOf(sp) }));

  function draw() {
    renderLegend();
    if (!WX) { if (S.tileLayer) S.tileLayer.redraw(); return; }
    if (S.overlay) { map.removeLayer(S.overlay); S.overlay = null; }
    if (!S.h || !S.series) return;
    refreshChips();
    const layers = MW.SPECIES.filter((sp) => S.checked.has(sp.id)).map((sp) => ({
      field: MW.render.field(S.h, valuesFor(sp, S.day)), potential: S.potentials[sp.id] || null, color: sp.color
    }));
    if (!layers.length) return;
    const cv = MW.render.paint(S.h, layers, S.mode, S.opacity);
    S.overlay = L.imageOverlay(cv.toDataURL(), [[B.south, B.west], [B.north, B.east]], { pane: 'heat', interactive: false }).addTo(map);
  }

  function renderLegend() {
    const sel = MW.SPECIES.filter((sp) => S.checked.has(sp.id));
    if (!sel.length) { $('#legend').innerHTML = '<span class="muted">Aucune espèce affichée</span>'; return; }
    if (WX) {
      $('#legend').innerHTML = sel.map((sp) => '<span><i style="background:' + sp.color + '"></i>' + esc(sp.name) + '</span>').join('');
      return;
    }
    const C = MW.CLASSES;
    const cols = 'style="grid-template-columns:minmax(0,1.6fr) repeat(' + C.labels.length + ',1fr)"';
    const head = '<div class="lg-row lg-head" ' + cols + '><span></span>' + C.labels.map((l, i) => '<span>' + esc(l) + '</span>').join('') + '</div>';
    const rows = sel.map((sp) => {
      if (S.potentialsReady && !hasData(sp)) return '<div class="lg-row" ' + cols + '><span class="lg-nm">' + esc(sp.name) + '</span><span class="lg-miss">pas de données</span></div>';
      return '<div class="lg-row" ' + cols + '><span class="lg-nm">' + esc(sp.name) + '</span>' +
        MW.render.ramp(sp.color).map((c, i) => '<i title="' + esc(C.labels[i]) + '" style="background:rgb(' + c.join(',') + ')"></i>').join('') + '</div>';
    }).join('');
    $('#legend').innerHTML = '<div class="lg">' + head + rows + '</div><p class="muted small lg-note">Milieux favorables à chaque espèce, comparés aux autres forêts wallonnes. Ce n’est pas une probabilité de trouvaille. Dézoomé, chaque zone est une moyenne : zoome pour voir les meilleurs secteurs.</p>';
  }

  /* ---------- battues : jour choisi, zones fermées, alerte ---------- */
  const JOURS = D.joursProches();
  const libelle = (iso) => (iso === JOURS[0].iso ? 'aujourd’hui' : iso === JOURS[1].iso ? 'demain' : D.formatDate(iso));
  const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function renderJours() {
    $('#jours').innerHTML = JOURS.map((j) => '<button type="button" data-iso="' + j.iso + '" aria-pressed="' + (j.iso === S.jour) + '" title="' + esc(D.formatDate(j.iso)) + '">' + esc(j.label) + '</button>').join('');
    $('#jours').querySelectorAll('button').forEach((b) => { b.onclick = () => { S.jour = b.dataset.iso; chargerFermetures(); }; });
  }
  function bboxOf(g) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; } else c.forEach(walk); };
    walk(g.coordinates);
    return b;
  }
  // point dans un polygone (règle pair-impair sur tous les anneaux : les trous sont gérés)
  function dansAnneaux(x, y, anneaux) {
    let dedans = false;
    anneaux.forEach((r) => {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
      }
    });
    return dedans;
  }
  function fermeAuPoint(lat, lng) {
    if (!S.ferm) return null;
    for (const z of S.ferm) {
      const b = z.b;
      if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
      const g = z.f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      if (polys.some((p) => dansAnneaux(lng, lat, p))) return z.f;
    }
    return null;
  }
  async function chargerFermetures() {
    renderJours();
    const iso = S.jour, tok = ++S.fermTok;
    $('#chasseEtat').textContent = 'Chargement des fermetures du ' + D.formatDate(iso) + '…';
    try {
      const g = await D.fermeturesDuJour(iso);
      if (tok !== S.fermTok) return;
      if (S.fermLayer) map.removeLayer(S.fermLayer);
      const feats = (g.features || []).filter((f) => f.geometry);
      S.ferm = feats.map((f) => ({ f, b: bboxOf(f.geometry) }));
      S.fermErr = false;
      S.fermLayer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
        renderer: rendF, interactive: false, className: 'zone-fermee',
        style: { className: 'zone-fermee', color: '#a5301d', weight: 1.5, opacity: 0.9, fillColor: '#a5301d', fillOpacity: 1 }
      }).addTo(map);
    } catch (e) {
      if (tok !== S.fermTok) return;
      S.ferm = null; S.fermErr = true;
      if (S.fermLayer) { map.removeLayer(S.fermLayer); S.fermLayer = null; }
    }
    majAlerte();
  }
  function majAlerte() {
    const el = $('#alerteChasse'), jour = libelle(S.jour);
    if (S.fermErr) {
      el.classList.add('inconnu');
      el.innerHTML = D.ALERTE + '<div><b>Battues : vérification impossible pour l’instant.</b> Fie-toi aux affiches rouges à l’entrée des chemins.</div>';
      el.hidden = false;
      $('#chasseEtat').textContent = 'Fermetures indisponibles (réseau ou service du SPW). Réessaie plus tard.';
      return;
    }
    el.classList.remove('inconnu');
    if (!S.ferm) { el.hidden = true; return; }
    const total = S.ferm.length, v = map.getBounds();
    const n = S.ferm.filter((z) => z.b[2] >= v.getWest() && z.b[0] <= v.getEast() && z.b[3] >= v.getSouth() && z.b[1] <= v.getNorth()).length;
    $('#chasseEtat').innerHTML = total
      ? '<b>' + total + '</b> territoire' + (total > 1 ? 's' : '') + ' fermé' + (total > 1 ? 's' : '') + ' en Wallonie ' + esc(jour) + ', hachuré' + (total > 1 ? 's' : '') + ' en rouge.'
      : 'Aucune fermeture déclarée en Wallonie ' + esc(jour) + '. L’affiche sur place fait foi.';
    if (n) {
      el.innerHTML = D.ALERTE + '<div><b>' + esc(majuscule(jour)) + ' : ' + n + ' territoire' + (n > 1 ? 's' : '') + ' fermé' + (n > 1 ? 's' : '') + ' pour la chasse dans cette zone.</b> ' +
        'Zones hachurées : on n’y entre pas, même pour cueillir. <a href="battues.html">Calendrier</a></div>';
      el.hidden = false;
    } else el.hidden = true;
  }
  map.on('moveend', majAlerte);

  /* ---------- lecture du potentiel en un point ---------- */
  async function lignesPotentiel(lat, lng) {
    if (S.modeCarte === 'plantes') return MW.plantes.lignes(lat, lng);
    if (WX) {
      if (!S.series) return '<p class="muted">Météo en cours de chargement…</p>';
      const rows = MW.SPECIES.map((sp) => {
        const vals = valuesFor(sp, S.day), r = MW.render.valueAt(S.grid, vals, lat, lng);
        const st = MW.model.state(sp, S.series[r.nearest], S.todayIdx + S.day);
        return '<tr><td><i class="dot" style="background:' + sp.color + '"></i>' + esc(sp.name) + '</td><td>' + Math.round(r.v * 100) + ' %</td><td>' + STATE_LABEL[st.key] + '</td></tr>';
      }).join('');
      return '<table class="pop">' + rows + '</table><small>Indice météo du ' + esc(dateStr(S.day)) + '.</small>';
    }
    if (!S.potentialsReady) return '<p class="muted">Chargement…</p>';
    const rows = await Promise.all(MW.SPECIES.map(async (sp) => {
      const ok = S.available.has(sp.id), v = ok ? await MW.tuiles.valueAt(S.tiles, sp.id, lat, lng) : null;
      const k = v == null ? -1 : MW.render.classOf(v);
      const txt = !ok ? '<span class="muted">pas de données</span>' : v == null ? '<span class="muted">hors zone</span>' : !(v > 0) ? 'hors forêt'
        : (k < 0 ? 'en dessous de « ' + MW.CLASSES.labels[0] + ' »' : '<b>' + MW.CLASSES.labels[k] + '</b>') + ' · mieux que ' + Math.round(v * 100) + ' % des forêts';
      return '<tr><td><i class="dot" style="background:' + sp.color + '"></i>' + esc(sp.name) + '</td><td>' + txt + '</td></tr>';
    }));
    return '<table class="pop">' + rows.join('') + '</table><small>Milieu seulement, sans la météo. Ceci n’identifie aucun champignon.</small>';
  }

  /* ---------- fiche « Puis-je cueillir ici ? » + « Pourquoi ici ? » ---------- */
  const fiche = $('#fiche'), corps = $('#ficheCorps');
  const montrerFiche = (on) => { fiche.hidden = !on; document.body.classList.toggle('fiche-ouverte', on); };
  function fermerFiche() {
    montrerFiche(false); S.ficheTok++;
    if (S.ficheMarker) { map.removeLayer(S.ficheMarker); S.ficheMarker = null; }
  }
  fiche.querySelector('.fermer').onclick = fermerFiche;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !fiche.hidden) fermerFiche(); });
  function ficheMessage(html) {
    S.ficheTok++;
    corps.innerHTML = '<p class="surtitre">Puis-je cueillir ici ?</p><p>' + html + '</p>';
    montrerFiche(true);
  }
  function ouvrirFiche(lat, lng, titre) {
    const tok = ++S.ficheTok;
    if (S.ficheMarker) map.removeLayer(S.ficheMarker);
    S.ficheMarker = L.circleMarker([lat, lng], { radius: 9, color: '#2b241c', weight: 3, fillColor: '#e3801b', fillOpacity: 1, interactive: false }).addTo(map);
    corps.innerHTML = '<p class="surtitre">' + esc(titre) + ' · ' + esc(D.formatDate(S.jour)) + '</p>' +
      '<p class="mono petit discret" style="margin:0">' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</p>' +
      '<div data-part="verdict"><p class="discret">Vérification auprès des services publics…</p></div>' +
      '<h3 class="sous">Pourquoi ici ?</h3><div data-part="pourquoi"><p class="discret">Lecture du sol, du relief et de la forêt…</p></div>' +
      '<h3 class="sous">Milieu favorable à…</h3><div data-part="potentiel"><p class="discret">Lecture…</p></div>' +
      '<p class="petit discret" style="margin-top:14px">Un milieu favorable n’est pas une trouvaille. Doute = on ne mange pas : <a href="avant-de-manger.html">Avant de manger</a>.</p>';
    montrerFiche(true);
    fiche.scrollTop = 0;
    const part = (n) => corps.querySelector('[data-part=' + n + ']');
    const poser = (n, html) => { if (tok === S.ficheTok) part(n).innerHTML = html; };
    D.verifier(lat, lng, S.jour).then((r) => poser('verdict', D.rendre(r)))
      .catch(() => poser('verdict', '<div class="verdict-tete">' + D.statut('inconnu', 'À vérifier') + '<h3>Vérification impossible pour l’instant</h3></div><p>Fie-toi aux panneaux sur place.</p>'));
    MW.pourquoi.expliquer(lat, lng).then((h) => poser('pourquoi', h)).catch(() => poser('pourquoi', '<p class="discret">Explication indisponible pour l’instant.</p>'));
    lignesPotentiel(lat, lng).then((h) => poser('potentiel', h));
  }
  function ici() {
    if (!navigator.geolocation) return ficheMessage('Ton navigateur ne donne pas ta position. Touche la carte à l’endroit voulu, puis « Puis-je cueillir ici ? ».');
    ficheMessage('Recherche de ta position…');
    navigator.geolocation.getCurrentPosition((p) => {
      const lat = p.coords.latitude, lng = p.coords.longitude;
      map.setView([lat, lng], Math.max(map.getZoom(), 14));
      if (S.moi) map.removeLayer(S.moi);
      S.moi = L.circleMarker([lat, lng], { radius: 7, color: '#ffffff', weight: 3, fillColor: '#2f6fa8', fillOpacity: 1, interactive: false }).addTo(map);
      ouvrirFiche(lat, lng, 'Ta position');
    }, (err) => {
      ficheMessage('Position indisponible (' + (err.code === 1 ? 'accès refusé' : 'pas de signal') + '). Touche la carte à l’endroit voulu, puis « Puis-je cueillir ici ? ».');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  $('#ici').onclick = ici;

  /* ---------- double mode : Champignons / Plantes et fruits (dernier choix mémorisé, ?mode=plantes) ---------- */
  MW.plantes.init({
    map, getMode: () => S.mode,
    panneau(html) { S.ficheTok++; if (S.ficheMarker) { map.removeLayer(S.ficheMarker); S.ficheMarker = null; } corps.innerHTML = html; montrerFiche(true); fiche.scrollTop = 0; }
  });
  function appliquerMode(m, memoriser) {
    S.modeCarte = m === 'plantes' ? 'plantes' : 'champignons';
    if (memoriser) store.set('mw-mode-carte', S.modeCarte);
    document.body.classList.toggle('mode-plantes', S.modeCarte === 'plantes');
    document.querySelectorAll('.bascule-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.modeCarte)));
    $('#sectionChampi').hidden = S.modeCarte === 'plantes';
    $('#plantesSection').hidden = S.modeCarte !== 'plantes';
    $('#panel h1').innerHTML = S.modeCarte === 'plantes' ? 'Carte <span>plantes et fruits</span>' : 'Carte <span>des milieux</span>';
    map.closePopup();
    if (S.tileLayer) S.tileLayer.redraw();
    MW.plantes.activer(S.modeCarte === 'plantes');
  }
  document.querySelectorAll('.bascule-mode button').forEach((b) => b.addEventListener('click', () => {
    appliquerMode(b.dataset.mode, true);
    if (mobile.matches && S.modeCarte === 'plantes') replier(false);
  }));
  const modeUrl = new URLSearchParams(location.search).get('mode');
  appliquerMode(modeUrl || store.get('mw-mode-carte', 'champignons'), !!modeUrl);
  // sur la carte, l'onglet « Ici ? » agit sans recharger la page
  const ongletIci = document.querySelector('.onglets a.ici');
  if (ongletIci) ongletIci.addEventListener('click', (e) => { e.preventDefault(); ici(); });

  /* ---------- clic carte : popup (potentiel, fermeture du jour) ou ajout d'un coin ---------- */
  map.on('click', (e) => {
    if (S.addMode) return placeCoin(e.latlng);
    const lat = e.latlng.lat, lng = e.latlng.lng, ferme = fermeAuPoint(lat, lng);
    const box = document.createElement('div');
    box.className = 'pop-ici';
    box.innerHTML = (ferme ? '<div class="pop-alerte" role="alert">' + D.ALERTE + '<span><b>Fermé pour la chasse ' + esc(libelle(S.jour)) + ' :</b> on n’y entre pas, même pour cueillir.</span></div>' : '') +
      '<b>Milieu favorable à…</b><div class="pop-rows"><span class="muted">Lecture…</span></div>' +
      '<button type="button" class="pop-btn">Puis-je cueillir ici ? Pourquoi ici ?</button>';
    box.querySelector('.pop-btn').onclick = () => { map.closePopup(); ouvrirFiche(lat, lng, 'Point choisi'); };
    L.popup({ maxWidth: 320 }).setLatLng(e.latlng).setContent(box).openOn(map);
    lignesPotentiel(lat, lng).then((h) => { box.querySelector('.pop-rows').innerHTML = h; });
  });

  /* ---------- démarrage : potentiels (+ grille et météo si activée) ---------- */
  async function start() {
    if (!WX) {
      // potentiel de site seul : tuiles data/tuiles/<id>/ décrites par data/tuiles/index.json
      $('#status').textContent = 'Chargement des tuiles de potentiel…';
      S.tiles = await MW.tuiles.charger();
      S.available = new Set(S.tiles ? S.tiles.especes : []);
      S.potentialsReady = true;
      const missing = MW.SPECIES.filter((sp) => !S.available.has(sp.id));
      missing.forEach((sp) => { const c = $('#chip-' + sp.id); c.hidden = false; c.textContent = 'pas de données'; c.className = 'chip hors'; });
      const none = !S.available.size;
      $('#notice').hidden = !missing.length;
      $('#notice').classList.toggle('empty', none);
      $('#notice').innerHTML = none
        ? '<b>Aucune donnée de potentiel dans data/tuiles/.</b> La carte reste vide : lancer <code>scripts\\potentiel.bat</code> (étape 3 de la feuille de route).'
        : 'Pas de données pour : ' + missing.map((sp) => esc(sp.name)).join(', ') + '. Ces espèces ne sont pas affichées.';
      $('#mapMsg').hidden = !none;
      if (!none) S.tileLayer = MW.tuiles.create(S.tiles, tileLayers, () => S.mode).addTo(map);
      $('#status').textContent = 'Milieux seuls (météo dans le bulletin) · ' + S.available.size + '/' + MW.SPECIES.length + ' espèces' + (S.tiles ? ' · calcul du ' + S.tiles.date : '');
      draw(); renderCoins();
      return;
    }
    S.grid = MW.weather.buildGrid();
    S.h = MW.render.create(S.grid, 480);
    $('#status').textContent = 'Chargement des rasters de potentiel…';
    let loaded = 0;
    await Promise.all(MW.SPECIES.map(async (sp) => {
      const f = await MW.render.loadPotential(S.h, 'data/potentiel-' + sp.id + '.png');
      if (f) { S.potentials[sp.id] = f; loaded++; }
    }));
    S.potentialsReady = true;
    $('#notice').hidden = loaded === MW.SPECIES.length;
    $('#notice').textContent = loaded
      ? 'Potentiel de site chargé pour ' + loaded + '/' + MW.SPECIES.length + ' espèces ; les autres restent en potentiel neutre.'
      : 'Potentiel de site neutre : la carte ne montre pour l’instant que l’effet de la météo. Les rasters sol/essence/pente/exposition restent à produire (voir CLAUDE.md).';
    $('#status').textContent = 'Chargement de la météo (' + S.grid.length + ' points)…';
    try {
      const w = await MW.weather.load(S.grid, (p) => { $('#status').textContent = 'Météo… ' + Math.round(p * 100) + ' %'; });
      S.series = w.series; S.todayIdx = w.todayIdx;
      $('#status').textContent = 'Météo Open-Meteo · ' + new Date(w.fetchedAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) + (w.fromCache ? ' (cache)' : '');
      updateDayLabel(); draw(); renderCoins();
    } catch (e) {
      $('#status').textContent = 'Météo indisponible : ' + e.message;
    }
  }

  /* ---------- recherche de lieu (Nominatim / OpenStreetMap, Belgique) ---------- */
  // Politique Nominatim : 1 requête/s max, pas d'autocomplétion → recherche à la validation seulement.
  const results = $('#results');
  function goTo(p) {
    const b = p.boundingbox.map(Number); // [sud, nord, ouest, est]
    map.fitBounds([[b[0], b[2]], [b[1], b[3]]], { maxZoom: 14 });
    if (S.placeMarker) map.removeLayer(S.placeMarker);
    S.placeMarker = L.circleMarker([+p.lat, +p.lon], { radius: 7, color: '#2b241c', weight: 2, fillColor: '#e3801b', fillOpacity: 1, interactive: false })
      .bindTooltip(esc(p.display_name.split(',')[0]), { permanent: true, direction: 'right', offset: [8, 0] }).addTo(map);
    results.hidden = true;
    if (mobile.matches) replier(true);
  }
  $('#search').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#q').value.trim();
    if (!q) return;
    results.hidden = false; results.innerHTML = '<li class="muted">Recherche…</li>';
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=be&limit=5&accept-language=fr&q=' + encodeURIComponent(q));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const found = await r.json();
      if (!found.length) { results.innerHTML = '<li class="muted">Aucun lieu trouvé en Belgique.</li>'; return; }
      if (found.length === 1) return goTo(found[0]);
      results.innerHTML = '';
      found.forEach((p) => {
        const li = document.createElement('li'), bt = document.createElement('button');
        bt.type = 'button'; bt.textContent = p.display_name; bt.onclick = () => goTo(p);
        li.appendChild(bt); results.appendChild(li);
      });
    } catch (err) {
      results.innerHTML = '<li class="muted">Recherche indisponible (' + esc(err.message) + ').</li>';
    }
  });

  /* ---------- couches wallonnes (WMS) ---------- */
  const svcSel = $('#svc');
  MW.SERVICES.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s.label; svcSel.appendChild(o); });
  const customOpt = document.createElement('option'); customOpt.value = ''; customOpt.textContent = 'Autre URL WMS…'; svcSel.appendChild(customOpt);
  function pickService() {
    const s = MW.SERVICES[svcSel.value];
    $('#svcUrl').value = s ? s.url : '';
    $('#lyrName').value = s ? s.layer : '';
  }
  svcSel.addEventListener('change', pickService);
  pickService();
  const layerLabel = (url, name) => { const s = MW.SERVICES.find((x) => x.url === url && x.layer === name); return s ? s.label : name; };

  function addWms(url, name, opacity, persist) {
    const lyr = L.tileLayer.wms(url, { layers: name, format: 'image/png', transparent: true, opacity: opacity, version: '1.3.0' }).addTo(map);
    S.layers.push({ url, name, lyr, opacity });
    if (persist) store.set('mw-wms', S.layers.map((l) => ({ url: l.url, name: l.name, opacity: l.opacity })));
    renderLayerList();
  }
  function renderLayerList() {
    const ul = $('#wmsList'); ul.innerHTML = '';
    S.layers.forEach((l, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span title="' + esc(l.url + ' · ' + l.name) + '">' + esc(layerLabel(l.url, l.name)) + '</span><input type="range" min="0.1" max="1" step="0.1" value="' + l.opacity + '"><button type="button" aria-label="Retirer">×</button>';
      li.querySelector('input').oninput = (e) => { l.opacity = +e.target.value; l.lyr.setOpacity(l.opacity); store.set('mw-wms', S.layers.map((x) => ({ url: x.url, name: x.name, opacity: x.opacity }))); };
      li.querySelector('button').onclick = () => { map.removeLayer(l.lyr); S.layers.splice(i, 1); store.set('mw-wms', S.layers.map((x) => ({ url: x.url, name: x.name, opacity: x.opacity }))); renderLayerList(); };
      ul.appendChild(li);
    });
  }
  $('#addWms').onclick = () => {
    const url = $('#svcUrl').value.trim(), name = $('#lyrName').value.trim();
    if (!url || !name) return;
    addWms(url, name, 0.7, true); $('#lyrName').value = '';
  };
  S.wms.forEach((w) => addWms(w.url, w.name, w.opacity, false));

  async function capabilities(url) {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'service=WMS&request=GetCapabilities');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const xml = new DOMParser().parseFromString(await r.text(), 'text/xml');
    return [...xml.getElementsByTagName('Layer')].map((n) => { const nm = [...n.children].find((c) => c.localName === 'Name'); return nm ? nm.textContent : null; }).filter(Boolean);
  }
  $('#diag').onclick = async () => {
    const out = $('#diagOut'); out.innerHTML = 'Test en cours…';
    const lines = [];
    for (const s of MW.SERVICES.concat($('#svcUrl').value && !MW.SERVICES.some((x) => x.url === $('#svcUrl').value) ? [{ label: 'URL saisie', url: $('#svcUrl').value }] : [])) {
      try {
        const names = await capabilities(s.url);
        const missing = s.layer ? s.layer.split(',').filter((n) => !names.includes(n)) : [];
        lines.push((missing.length ? '❌ ' : '✅ ') + esc(s.label) + ' : ' + names.length + ' couches' + (missing.length ? ', couche(s) absente(s) : ' + esc(missing.join(', ')) : ''));
        if (s.url === $('#svcUrl').value) $('#lyrNames').innerHTML = names.map((n) => '<option value="' + esc(n) + '">').join('');
      } catch (e) {
        lines.push('⚠️ ' + esc(s.label) + ' : lecture impossible (' + esc(e.message) + '). URL erronée ou CORS bloqué. Les tuiles peuvent quand même s’afficher si tu saisis le nom de couche à la main.');
      }
    }
    out.innerHTML = lines.join('<br>');
  };

  /* ---------- « Mes coins » (même carnet que carnet.html : clé mw-coins) ---------- */
  const sel = $('#coinSp');
  MW.SPECIES.forEach((sp) => { const o = document.createElement('option'); o.value = sp.id; o.textContent = sp.name; sel.appendChild(o); });
  const RES = { beaucoup: '#2c6a37', peu: '#e3a11b', rien: '#a5301d' };
  function modeAjout(on) {
    S.addMode = on;
    $('#coinAdd').textContent = on ? 'Touche la carte… (annuler)' : 'Placer un coin sur la carte';
    document.getElementById('map').classList.toggle('adding', on);
  }
  $('#coinAdd').onclick = () => { modeAjout(!S.addMode); if (S.addMode && mobile.matches) replier(true); };
  async function placeCoin(ll) {
    const sp = MW.SPECIES.find((x) => x.id === $('#coinSp').value);
    let idx = null;
    if (S.series) { const r = MW.render.valueAt(S.grid, valuesFor(sp, 0), ll.lat, ll.lng); idx = +r.v.toFixed(2); }
    const pv = S.available.has(sp.id) ? await MW.tuiles.valueAt(S.tiles, sp.id, ll.lat, ll.lng) : null;
    S.coins = store.get('mw-coins', []); // relu : le carnet a pu changer dans un autre onglet
    S.coins.push({ id: Date.now(), lat: +ll.lat.toFixed(5), lon: +ll.lng.toFixed(5), date: MW.weather.todayBrussels(), species: sp.id, result: $('#coinRes').value, note: $('#coinNote').value.trim(), modelIndex: idx, sitePotential: pv == null ? null : +pv.toFixed(2) });
    store.set('mw-coins', S.coins); $('#coinNote').value = '';
    modeAjout(false);
    renderCoins();
  }
  function renderCoins() {
    S.coinMarkers.forEach((m) => map.removeLayer(m)); S.coinMarkers = [];
    const ul = $('#coinList'); ul.innerHTML = '';
    S.coins.forEach((c, i) => {
      const sp = MW.SPECIES.find((x) => x.id === c.species) || { name: c.species };
      const m = L.circleMarker([c.lat, c.lon], { radius: 7, color: '#2b241c', weight: 2, fillColor: RES[c.result] || '#fff', fillOpacity: 1 }).addTo(map);
      m.bindPopup('<b>' + esc(sp.name) + '</b> · ' + esc(c.result) + '<br>' + esc(c.date) + (c.modelIndex != null ? ' · indice modèle ' + Math.round(c.modelIndex * 100) + ' %' : '') + (c.sitePotential != null ? ' · potentiel ' + Math.round(c.sitePotential * 100) + ' %' : '') + (c.note ? '<br>' + esc(c.note) : ''));
      S.coinMarkers.push(m);
      const li = document.createElement('li');
      li.innerHTML = '<span>' + esc(c.date) + ' · ' + esc(sp.name) + ' · ' + esc(c.result) + (c.modelIndex != null ? ' (modèle ' + Math.round(c.modelIndex * 100) + ' %)' : '') + '</span><button type="button" aria-label="Supprimer">×</button>';
      li.querySelector('button').onclick = () => { S.coins.splice(i, 1); store.set('mw-coins', S.coins); renderCoins(); };
      ul.appendChild(li);
    });
  }
  $('#coinExport').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S.coins, null, 2)], { type: 'application/json' }));
    a.download = 'mes-coins.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#coinImport').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const arr = JSON.parse(await f.text()); if (Array.isArray(arr)) { S.coins = arr; store.set('mw-coins', S.coins); renderCoins(); } } catch (err) { /* fichier invalide */ }
    e.target.value = '';
  });

  renderCoins(); renderLegend(); updateDayLabel();
  start();
  chargerFermetures();

  // liens d'entrée : carte.html?ici=1 (onglet « Ici ? ») et carte.html?ajout=1 (depuis le carnet)
  const params = new URLSearchParams(location.search);
  if (params.has('ici') || params.has('ajout')) history.replaceState(null, '', location.pathname + location.hash);
  if (params.has('ici')) ici();
  if (params.has('ajout')) { replier(false); $('#coinsBox').open = true; modeAjout(true); }
})();
