/* « Puis-je cueillir ici ? » et battues : interrogation en direct des services publics du SPW, sans serveur.
   - Propriétés gérées par le DNF + triages (cantonnement, téléphone) : FAUNE_FLORE/LIMITES_DNF (CC-BY 4.0)
   - Territoires et dates de chasse avec fermeture, version anonymisée : FAUNE_FLORE/CHASSE_TERRIT_ANONYM (CC-BY 4.0, mise à jour quotidienne)
   - Réserves naturelles et forestières : FAUNE_FLORE/CONSNAT
   - Règlements communaux connus : data/communes.json
   Résultat INDICATIF : l'affiche sur place fait foi. On n'efface jamais la carte des forêts privées : on informe. */
(function (root) {
  const MW = (root.MW = root.MW || {});
  const AGS = 'https://geoservices.wallonie.be/arcgis/rest/services/FAUNE_FLORE/';
  const SRV = { dnf: AGS + 'LIMITES_DNF/MapServer', chasse: AGS + 'CHASSE_TERRIT_ANONYM/MapServer/0', consnat: AGS + 'CONSNAT/MapServer' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- dates (fuseau de Bruxelles) ---------- */
  function todayISO() {
    try { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const jourSemaine = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay(); // 0 dimanche … 6 samedi
  const ddmmyyyy = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const versISO = (d) => d.slice(6, 10) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2);
  function formatDate(iso, court) {
    const d = new Date(iso + 'T12:00:00Z');
    return d.toLocaleDateString('fr-BE', court ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' } : { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }
  // aujourd'hui, demain, et le prochain week-end (sans doublon)
  function joursProches() {
    const t = todayISO(), out = [{ iso: t, label: 'Aujourd’hui' }, { iso: addDays(t, 1), label: 'Demain' }];
    let sam = t; while (jourSemaine(sam) !== 6) sam = addDays(sam, 1);
    const dim = addDays(sam, 1);
    [[sam, 'Samedi'], [dim, 'Dimanche']].forEach(([iso, l]) => { if (!out.some((o) => o.iso === iso)) out.push({ iso, label: l }); });
    return out;
  }
  function prochainWeekEnd() {
    const t = todayISO(); let sam = t;
    if (jourSemaine(t) === 0) return [t];
    while (jourSemaine(sam) !== 6) sam = addDays(sam, 1);
    return [sam, addDays(sam, 1)];
  }

  /* ---------- requêtes ---------- */
  async function getJSON(url, ms) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 15000);
    try {
      const r = await fetch(url, { signal: c.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j && j.error) throw new Error(j.error.message || 'erreur du service');
      return j;
    } finally { clearTimeout(t); }
  }
  const pointQ = (lat, lng, champs) => 'query?geometry=' + lng + ',' + lat + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects' +
    '&outFields=' + champs + '&returnGeometry=false&f=json';
  const whereDates = (isos) => isos.map(ddmmyyyy).map((d) =>
    "LISTOFDATEBATTUECLOSE LIKE '%" + d + "%' OR LISTOFDATEAFFUTCLOSE LIKE '%" + d + "%' OR LISTOFDATEAUTRECLOSE LIKE '%" + d + "%'").join(' OR ');

  function datesFermeture(a) {
    const out = [];
    [['LISTOFDATEBATTUECLOSE', 'battue'], ['LISTOFDATEAFFUTCLOSE', 'affût'], ['LISTOFDATEAUTRECLOSE', 'autre chasse']].forEach(([k, type]) => {
      String(a[k] || '').split(';').map((s) => s.trim()).filter((s) => /^\d{2}\/\d{2}\/\d{4}$/.test(s)).forEach((d) => out.push({ date: versISO(d), type }));
    });
    return out.sort((x, y) => x.date.localeCompare(y.date));
  }

  // territoires fermés un jour donné, en GeoJSON simplifié (pour la carte)
  const cacheJour = new Map();
  function fermeturesDuJour(iso) {
    if (!cacheJour.has(iso)) {
      const url = SRV.chasse + '/query?where=' + encodeURIComponent(whereDates([iso])) +
        '&outFields=KEYG,CAN,SERVICE,LISTOFDATEBATTUECLOSE,LISTOFDATEAFFUTCLOSE,LISTOFDATEAUTRECLOSE,DATE_EXTRACT' +
        '&outSR=4326&maxAllowableOffset=0.0002&geometryPrecision=5&f=geojson';
      cacheJour.set(iso, getJSON(url, 30000).then((g) => {
        (g.features || []).forEach((f) => {
          const types = datesFermeture(f.properties).filter((d) => d.date === iso).map((d) => d.type);
          f.properties.types = [...new Set(types)];
        });
        return g;
      }).catch((e) => { cacheJour.delete(iso); throw e; }));
    }
    return cacheJour.get(iso);
  }
  // nombre de territoires fermés (un ou plusieurs jours), éventuellement dans une emprise [ouest, sud, est, nord]
  async function compterFermetures(isos, emprise) {
    let url = SRV.chasse + '/query?where=' + encodeURIComponent(whereDates(isos)) + '&returnCountOnly=true&f=json';
    if (emprise) url += '&geometry=' + emprise.join(',') + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects';
    return (await getJSON(url)).count;
  }
  // territoires de chasse dans une emprise, avec leurs dates (pour le calendrier d'un massif)
  async function territoiresDansEmprise(emprise) {
    const url = SRV.chasse + '/query?where=1%3D1&geometry=' + emprise.join(',') + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects' +
      '&outFields=KEYG,CAN,SERVICE,LISTOFDATEBATTUECLOSE,LISTOFDATEAFFUTCLOSE,LISTOFDATEAUTRECLOSE,DATE_EXTRACT&returnGeometry=false&f=json';
    return ((await getJSON(url, 30000)).features || []).map((f) => ({ keyg: f.attributes.KEYG, service: f.attributes.SERVICE, dates: datesFermeture(f.attributes), extract: f.attributes.DATE_EXTRACT }));
  }
  async function territoireAuPoint(lat, lng) {
    const j = await getJSON(SRV.chasse + '/' + pointQ(lat, lng, 'KEYG,CAN,SERVICE,LISTOFDATEBATTUECLOSE,LISTOFDATEAFFUTCLOSE,LISTOFDATEAUTRECLOSE,DATE_EXTRACT'));
    const f = j.features || [];
    const dates = [], vus = new Set();
    f.forEach((x) => datesFermeture(x.attributes).forEach((d) => { const k = d.date + d.type; if (!vus.has(k)) { vus.add(k); dates.push(d); } }));
    dates.sort((x, y) => x.date.localeCompare(y.date));
    return { territoire: f.length > 0, service: f.length ? f[0].attributes.SERVICE : '', dates, extract: f.length ? f[0].attributes.DATE_EXTRACT : null };
  }

  let communesP = null;
  const communes = () => (communesP = communesP || fetch('data/communes.json').then((r) => r.json()).catch(() => ({ communes: {} })));
  const norme = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+CNE$/, '').trim();
  // « CANTONNEMENT DE NASSOGNE » -> « Cantonnement de Nassogne » (petits mots en minuscules, sauf en tête)
  const titre = (s) => String(s || '').toLowerCase().replace(/(^|[\s'’-])\p{L}/gu, (m) => m.toUpperCase())
    .replace(/(\s)(De|Du|Des|Sur|Et|Aux?|D’|D')(?=[\s\p{L}])/gu, (m, a, b) => a + b.toLowerCase())
    .replace(/-(En|Sur|Lez|Les|La|Le|De|Du|Aux?)-/g, (m) => m.toLowerCase());

  const CAT = { 1: 'Forêt domaniale (Région wallonne)', 2: 'Forêt provinciale', 3: 'Bois communal', 4: 'Bois de CPAS', 5: 'Propriété d’un établissement public', 7: 'Autre terrain public', 9: 'Forêt privée gérée par le DNF' };

  /* ---------- le verdict ---------- */
  async function verifier(lat, lng, iso) {
    iso = iso || todayISO();
    const [prop, tri, terr, reserves, coms] = await Promise.allSettled([
      getJSON(SRV.dnf + '/0/' + pointQ(lat, lng, 'PROPRIETE,CATPROP')),
      getJSON(SRV.dnf + '/1/' + pointQ(lat, lng, 'SERVICE,CANTON,TEL_CAN')),
      territoireAuPoint(lat, lng),
      Promise.all([1, 2, 3].map((l) => getJSON(SRV.consnat + '/' + l + '/' + pointQ(lat, lng, 'NOM,URL')).then((j) => (j.features || []).map((f) => ({ couche: l, nom: f.attributes.NOM, url: f.attributes.URL }))))).then((a) => a.flat()),
      communes()
    ]);
    const r = { lat, lng, iso, statut: 'inconnu', mot: 'À vérifier', titre: '', texte: '', fermeAujourdhui: [], prochaines: [], contact: null, demande: null, erreurs: [] };
    [prop, tri, terr, reserves].forEach((x) => { if (x.status === 'rejected') r.erreurs.push(x.reason && x.reason.message); });

    if (tri.status === 'fulfilled' && tri.value.features && tri.value.features.length) {
      const a = tri.value.features[0].attributes;
      r.contact = { canton: titre(a.CANTON), tel: a.TEL_CAN, triage: titre(a.SERVICE) };
    }
    if (terr.status === 'fulfilled') {
      r.fermeAujourdhui = terr.value.dates.filter((d) => d.date === iso);
      r.prochaines = terr.value.dates.filter((d) => d.date > iso && d.date <= addDays(iso, 21));
      r.extract = terr.value.extract;
    }
    const res = reserves.status === 'fulfilled' ? reserves.value : [];
    const p = prop.status === 'fulfilled' && prop.value.features && prop.value.features.length ? prop.value.features[0].attributes : null;
    const cat = p ? +p.CATPROP : null;

    if (r.fermeAujourdhui.length) {
      r.statut = 'non'; r.mot = 'Non';
      r.titre = 'Fermé pour la chasse ' + (iso === todayISO() ? 'aujourd’hui' : formatDate(iso));
      r.texte = 'Une ' + [...new Set(r.fermeAujourdhui.map((d) => d.type))].join(' et une ') + ' avec fermeture est déclarée sur ce territoire. Ce jour-là, on n’y entre pas, même pour cueillir. Les sangliers ont la priorité.';
    } else if (res.length) {
      r.statut = 'non'; r.mot = 'Non';
      r.titre = 'Réserve : on admire, on ne cueille pas';
      r.texte = (res[0].nom ? titre(res[0].nom) + ' : ' : '') + 'dans une réserve naturelle ou forestière, la cueillette est en principe interdite. Renseigne-toi auprès du gestionnaire.';
    } else if (cat === 1) {
      r.statut = 'oui'; r.mot = 'Oui';
      r.titre = 'Oui, sous conditions';
      r.texte = (p.PROPRIETE ? titre(p.PROPRIETE) + ' : forêt ' : 'Forêt ') + 'domaniale. Cueillette permise du lever au coucher du soleil, 10 litres maximum par personne, sauf les jours de fermeture pour la chasse.';
    } else if (cat === 3) {
      const nom = norme(p.PROPRIETE), c = (coms.status === 'fulfilled' && coms.value.communes || {})[nom];
      const commune = c ? c.nom : titre(nom);
      r.statut = 'avec';
      if (c) {
        r.mot = c.type === 'reserve' ? 'Sous conditions' : 'À vérifier';
        r.titre = 'Bois communal de ' + commune + ' : règlement local';
        r.texte = c.regle;
        r.sources = c.sources;
      } else {
        r.mot = 'Sous conditions';
        r.titre = 'Bois communal de ' + commune;
        r.texte = 'Hors chemin, l’accord de la commune est requis. Certaines communes publient une autorisation générale : renseigne-toi auprès de l’administration communale.';
      }
      r.demande = { proprietaire: 'Administration communale de ' + commune, foret: 'Bois communal de ' + commune };
    } else if (cat) {
      r.statut = 'avec'; r.mot = 'Sous conditions';
      r.titre = (CAT[cat] || 'Propriété publique') + (p.PROPRIETE ? ' (' + titre(p.PROPRIETE) + ')' : '');
      r.texte = cat === 9 ? 'Forêt privée gérée par le DNF. Le nom du propriétaire n’est pas public : le cantonnement peut t’orienter. Sans accord, on reste sur les chemins.'
        : 'Hors chemin, l’accord du propriétaire est requis.';
      if (cat !== 9) r.demande = { proprietaire: titre(p.PROPRIETE || ''), foret: CAT[cat] };
    } else if (prop.status === 'fulfilled' && r.contact) {
      r.statut = 'avec'; r.mot = 'Sous conditions';
      r.titre = 'Forêt privée (ou non répertoriée comme publique)';
      r.texte = 'Ici, c’est chez quelqu’un. Sans son accord, on admire et on passe, en restant sur les chemins. Son nom n’est pas public : regarde s’il existe une forêt domaniale proche.';
    } else if (prop.status === 'fulfilled') {
      r.titre = 'Hors de Wallonie ou zone inconnue';
      r.texte = 'Aucune donnée wallonne ici. En Flandre et à Bruxelles, la cueillette est interdite dans les bois.';
    } else {
      r.titre = 'Vérification impossible pour l’instant';
      r.texte = 'Les services publics ne répondent pas (réseau ?). Fie-toi aux panneaux sur place.';
    }
    return r;
  }

  /* ---------- rendu ---------- */
  const ICO = {
    oui: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    avec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 6v8M12 18h.01"/></svg>',
    non: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    inconnu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7M12 18h.01"/></svg>'
  };
  const statut = (s, mot) => '<span class="statut ' + s + '">' + ICO[s] + esc(mot) + '</span>';
  const ALERTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5M12 17h.01"/></svg>';

  function mailDemande(r) {
    const sujet = 'Demande d’autorisation de cueillette de champignons';
    const corps = 'Bonjour,\n\nJe souhaiterais cueillir des champignons pour ma consommation personnelle dans ' + (r.demande.foret || 'votre forêt') +
      ', autour du point ' + r.lat.toFixed(5) + ', ' + r.lng.toFixed(5) + ' (https://www.openstreetmap.org/?mlat=' + r.lat.toFixed(5) + '&mlon=' + r.lng.toFixed(5) + '#map=16/' + r.lat.toFixed(5) + '/' + r.lng.toFixed(5) + ').\n\n' +
      'Dates souhaitées : …\nNombre de personnes : …\nQuantité : 10 litres maximum par personne.\n\n' +
      'Je m’engage à respecter les jours de fermeture pour la chasse, à ne pas piétiner inutilement et à repartir comme je suis venu.\n\nMerci d’avance pour votre réponse.\n';
    return 'mailto:?subject=' + encodeURIComponent(sujet) + '&body=' + encodeURIComponent(corps);
  }

  function rendre(r) {
    const h = [];
    if (r.statut === 'non' && r.fermeAujourdhui.length) h.push('<div class="alerte-battue" role="alert">' + ALERTE + '<div><b>Battue : on n’entre pas.</b> Respecte les panneaux rouges à l’entrée des chemins.</div></div>');
    h.push('<div class="verdict-tete">' + statut(r.statut, r.mot) + '<h3>' + esc(r.titre) + '</h3></div>');
    if (r.texte) h.push('<p>' + esc(r.texte) + '</p>');
    if (r.sources && r.sources.length) h.push('<p class="petit">Source : ' + r.sources.map((s) => '<a href="' + esc(s.u) + '" target="_blank" rel="noopener">' + esc(s.t) + '</a>').join(', ') + '</p>');
    if (r.prochaines.length) {
      h.push('<div class="prochaines"><b>Prochaines fermetures ici :</b><ul>' + r.prochaines.slice(0, 6).map((d) => '<li>' + esc(formatDate(d.date)) + ' · ' + esc(d.type) + '</li>').join('') + '</ul></div>');
    } else if (!r.fermeAujourdhui.length && r.extract !== undefined) {
      h.push('<p class="petit">Aucune fermeture pour la chasse déclarée ici dans les 3 prochaines semaines. L’absence d’info ne garantit pas l’absence de battue.</p>');
    }
    if (r.contact) h.push('<p class="contact">Gestionnaire public du secteur : <b>' + esc(r.contact.canton) + '</b>' + (r.contact.tel ? ' · <a href="tel:' + esc(r.contact.tel.replace(/[^\d+]/g, '')) + '">' + esc(r.contact.tel) + '</a>' : '') + '</p>');
    const actions = ['<a class="btn ligne" href="droit.html">Les règles en Wallonie</a>'];
    if (r.demande) actions.push('<a class="btn ligne" href="' + mailDemande(r) + '">Préparer une demande d’accord</a>');
    h.push('<div class="btns">' + actions.join('') + '</div>');
    h.push('<p class="petit discret">Indicatif : l’affiche sur place fait foi. Données publiques du SPW (DNF, chasse, réserves) consultées le ' + esc(formatDate(todayISO())) + '.' + (r.erreurs.length ? ' Certaines données n’ont pas répondu.' : '') + '</p>');
    return h.join('');
  }

  MW.droit = { verifier, rendre, statut, fermeturesDuJour, compterFermetures, territoiresDansEmprise, territoireAuPoint, todayISO, addDays, joursProches, prochainWeekEnd, formatDate, ALERTE };
})(typeof window !== 'undefined' ? window : globalThis);
