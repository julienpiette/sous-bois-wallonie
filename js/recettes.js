/* Recettes : catalogue filtrable (index léger data/recettes/index.json chargé au départ) et fiche détaillée
   (data/recettes/<id>.json chargé à la demande) avec recalcul selon le poids récolté.
   Filtres gardés dans l'adresse (lien partageable). Quantités en grammes, une décimale, jamais de fractions.
   Balisage schema.org Recipe ajouté pour la fiche affichée. */
(function () {
  const MW = window.MW, $ = (s) => document.querySelector(s);
  const zone = $('#recettes');
  if (!zone) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const g1 = (x) => x.toLocaleString('fr-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nomEsp = (id) => (MW.SPECIES.find((s) => s.id === id) || { name: id }).name;
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const especesDe = (r) => r.especes || (r.espece ? [r.espece] : []);
  // sosies affichés dans le bandeau de sécurité (même contenu que les fiches espèces)
  const SOSIES = {
    cepe: 'bolet amer, bolets à pores rouges (dont le bolet de Satan, toxique)',
    girolle: 'fausse girolle, cortinaires orangés (certains mortels)',
    chanterelle: 'cortinaires bruns (certains mortels)',
    morille: 'gyromitre (mortelle) ; les vraies morilles sont toxiques crues ou mal cuites',
    trompette: 'peu de sosies dangereux',
    pied: 'peu de sosies dangereux'
  };
  const TYPES = { entree: 'Entrée', plat: 'Plat', soupe: 'Soupe', sauce: 'Sauce', accompagnement: 'Accompagnement', douceur: 'Douceur', conservation: 'Conservation' };
  const SAISONS = { printemps: 'Printemps', ete: 'Été', automne: 'Automne', hiver: 'Hiver' };
  const NIVEAUX = { facile: 'Facile', moyen: 'Moyen', exigeant: 'Exigeant' };
  const REGIMES = { vegetarien: 'Végétarien', vegan: 'Vegan', 'sans-gluten': 'Sans gluten' };
  const DUREES = { 20: '20 min ou moins', 45: '45 min ou moins', 90: '1 h 30 ou moins', 999: 'Plus long' };
  const CONSERV = { prep: 'Pour conserver', congelable: 'Se congèle' };
  const duree = (m) => (m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''));

  const bandeau = (esps) => '<details class="securite"><summary>Sécurité : sosies et Centre Antipoisons</summary><div>' +
    esps.map((e) => '<p><b>Sosies de : ' + esc(nomEsp(e).toLowerCase()) + '</b> : ' + esc(SOSIES[e] || 'voir la fiche espèce') + '.</p>').join('') +
    '<p>Chaque exemplaire doit être identifié avec certitude, par un humain qui sait en cas de doute. Les champignons sauvages se mangent toujours bien cuits.</p>' +
    '<p>Intoxication : Centre Antipoisons <a href="tel:070245245">070 245 245</a> (24 h/24). <a href="avant-de-manger.html">Avant de manger</a> · ' +
    esps.map((e) => '<a href="especes.html#' + esc(e) + '">fiche ' + esc(nomEsp(e).toLowerCase()) + '</a>').join(' · ') + '</p></div></details>';

  const params = new URLSearchParams(location.search);
  if (params.get('r') && $('#r-hero')) $('#r-hero').hidden = true;
  async function charger(id) { const r = await fetch('data/recettes/' + encodeURIComponent(id) + '.json'); if (!r.ok) throw new Error(id); return r.json(); }
  const memo = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } };

  /* ---------- catalogue ---------- */
  const FILTRES = [
    ['espece', 'Espèce', () => Object.fromEntries(MW.SPECIES.map((s) => [s.id, s.name])), 'Toutes'],
    ['saison', 'Saison', () => SAISONS, 'Toutes'], ['type', 'Type de plat', () => TYPES, 'Tous'], ['duree', 'Durée', () => DUREES, 'Toutes'],
    ['niveau', 'Niveau', () => NIVEAUX, 'Tous'], ['regime', 'Régime', () => REGIMES, 'Tous'], ['conserv', 'Conservation', () => CONSERV, 'Toutes']
  ];
  const PAR_PAGE = 24;

  async function catalogue() {
    const idx = (await (await fetch('data/recettes/index.json')).json()).recettes;
    idx.sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
    const poids = params.get('poids');
    const champ = ([k, lib, opts, tous]) => '<label class="champ">' + lib + '<select id="r-' + k + '" data-f="' + k + '"><option value="">' + tous + '</option>' +
      Object.entries(opts()).map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('') + '</select></label>';
    // la recherche, l'espèce et la saison d'abord ; les cinq autres filtres repliés (ouverts si l'un d'eux est dans l'adresse)
    const autres = FILTRES.slice(2), autresActifs = autres.some(([k]) => params.get(k));
    zone.innerHTML =
      '<form id="r-filtres" class="r-filtres" role="search" aria-label="Filtrer les recettes" onsubmit="return false">' +
      '<label class="champ r-q">Rechercher<input type="search" id="r-q" placeholder="Ex. crème, risotto, noisette" autocomplete="off" enterkeyhint="search"></label>' +
      FILTRES.slice(0, 2).map(champ).join('') +
      '<details class="r-plus-filtres"' + (autresActifs ? ' open' : '') + '><summary>Plus de filtres <span>type de plat, durée, niveau, régime, conservation</span></summary>' +
        '<div class="r-filtres-suite">' + autres.map(champ).join('') + '</div></details>' +
      '</form>' +
      '<div class="r-compte"><p id="r-compte" aria-live="polite"></p><button type="button" class="btn ligne" id="r-effacer" hidden>Effacer les filtres</button></div>' +
      '<div id="r-liste" class="grille deux"></div><p class="r-plus"><button type="button" class="btn ligne" id="r-plus" hidden>Voir plus de recettes</button></p>';
    // valeurs initiales depuis l'adresse
    $('#r-q').value = params.get('q') || '';
    FILTRES.forEach(([k]) => { const v = params.get(k); if (v && $('#r-' + k).querySelector('option[value="' + CSS.escape(v) + '"]')) $('#r-' + k).value = v; });
    let n = PAR_PAGE;

    const garde = (r, f) => {
      if (f.espece && !r.especes.includes(f.espece)) return false;
      if (f.saison && !r.saisons.includes(f.saison)) return false;
      if (f.type && r.type !== f.type) return false;
      if (f.niveau && r.niveau !== f.niveau) return false;
      if (f.regime && !r.regimes.includes(f.regime)) return false;
      if (f.duree) { const d = +f.duree; if (d === 999 ? r.duree <= 90 : r.duree > d) return false; }
      if (f.conserv === 'prep' && r.type !== 'conservation') return false;
      if (f.conserv === 'congelable' && !r.congelable) return false;
      if (f.q) { const t = norm(r.titre + ' ' + r.chapeau + ' ' + r.mots + ' ' + r.especes.map(nomEsp).join(' ')); if (!f.q.split(/\s+/).every((m) => t.includes(m))) return false; }
      return true;
    };
    const carte = (r) => '<a class="carte r-carte" href="recettes.html?r=' + encodeURIComponent(r.id) + (poids ? '&poids=' + encodeURIComponent(poids) : '') + '">' +
      '<p class="r-tags"><span>' + esc(TYPES[r.type] || r.type) + '</span>' + (r.statut === 'brouillon' ? '<span class="brouillon">Brouillon</span>' : '') + '</p>' +
      '<h3>' + esc(r.titre) + '</h3><p class="discret">' + esc(r.chapeau) + '</p>' +
      '<p class="meta-r"><span>' + esc(r.especes.map(nomEsp).join(', ')) + '</span><span>' + duree(r.duree) + '</span><span>' + esc(NIVEAUX[r.niveau] || r.niveau) + '</span>' +
      r.regimes.map((x) => '<span>' + esc(REGIMES[x] || x) + '</span>').join('') + '</p></a>';

    function maj(remettre) {
      if (remettre) n = PAR_PAGE;
      const f = { q: norm($('#r-q').value.trim()) };
      FILTRES.forEach(([k]) => { f[k] = $('#r-' + k).value; });
      const res = idx.filter((r) => garde(r, f));
      $('#r-compte').textContent = res.length + ' recette' + (res.length > 1 ? 's' : '') + (res.length === idx.length ? '' : ' sur ' + idx.length);
      $('#r-liste').innerHTML = res.slice(0, n).map(carte).join('') ||
        '<p class="discret">Aucune recette ne correspond. Retire un filtre, ou regarde la <a href="conservation.html">conservation</a> pour garder ta récolte.</p>';
      $('#r-plus').hidden = res.length <= n;
      const actifs = !!$('#r-q').value.trim() || FILTRES.some(([k]) => $('#r-' + k).value);
      $('#r-effacer').hidden = !actifs;
      // adresse partageable
      const u = new URLSearchParams();
      if ($('#r-q').value.trim()) u.set('q', $('#r-q').value.trim());
      FILTRES.forEach(([k]) => { if (f[k]) u.set(k, f[k]); });
      if (poids) u.set('poids', poids);
      const s = u.toString();
      history.replaceState(null, '', 'recettes.html' + (s ? '?' + s : ''));
      memo('mw-recettes-filtres', s);
    }
    let minuterie;
    $('#r-q').addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(() => maj(true), 150); });
    FILTRES.forEach(([k]) => $('#r-' + k).addEventListener('change', () => maj(true)));
    $('#r-plus').addEventListener('click', () => { n += PAR_PAGE; maj(false); });
    $('#r-effacer').addEventListener('click', () => { $('#r-q').value = ''; FILTRES.forEach(([k]) => { $('#r-' + k).value = ''; }); maj(true); $('#r-q').focus(); });
    maj(true);
  }

  /* ---------- fiche ---------- */
  async function fiche(id) {
    const r = await charger(id);
    const esps = especesDe(r);
    document.title = r.titre + ' · ' + document.title.split(' · ').pop();
    const base = r.base_g, depart = Math.min(3000, Math.max(50, +(params.get('poids') || base) || base));
    const retour = memo('mw-recettes-filtres');
    zone.innerHTML = '<p><a href="recettes.html' + (retour ? '?' + esc(retour) : '') + '">Toutes les recettes</a></p>' +
      (r.statut === 'brouillon' ? '<span class="brouillon">Brouillon : recette en cours de test</span>' : '') +
      '<h1 style="margin-top:10px">' + esc(r.titre) + '</h1><p class="chapeau">' + esc(r.chapeau) + '</p>' +
      '<p class="meta-r"><span>' + esc(esps.map(nomEsp).join(', ')) + '</span>' + (r.type ? '<span>' + esc(TYPES[r.type] || r.type) + '</span>' : '') +
      '<span>Préparation ' + duree(r.preparation_min) + '</span><span>Cuisson ' + duree(r.cuisson_min) + '</span>' + (r.repos_min ? '<span>Repos ' + duree(r.repos_min) + '</span>' : '') +
      '<span>' + esc(NIVEAUX[r.niveau] || r.niveau) + '</span>' + (r.regimes || []).map((x) => '<span>' + esc(REGIMES[x] || x) + '</span>').join('') +
      (r.saisons ? '<span>' + esc(r.saisons.map((s) => SAISONS[s] || s).join(', ')) + '</span>' : '') + '</p>' +
      bandeau(esps) +
      (r.securite ? '<p class="regle">' + esc(r.securite) + '</p>' : '') +
      '<div class="recette">' +
      '<label class="poids"><span>Poids de ta récolte : <output id="r-poids-val">' + g1(depart) + ' g</output></span>' +
      '<input id="r-poids" type="range" min="50" max="3000" step="10" value="' + depart + '" aria-label="Poids de ta récolte en grammes">' +
      '<span class="petit discret">Les quantités se recalculent. Recette de base : ' + g1(base) + ' g de champignons frais pour ' + r.portions + ' personnes.</span></label>' +
      '<h2 style="font-size:22px">Ingrédients</h2><ul class="ingr" id="r-ingr"></ul>' +
      '<h2 style="font-size:22px">Étapes</h2><ol class="etapes-r">' + r.etapes.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ol>' +
      (r.conservation ? '<h2 style="font-size:22px">Conserver</h2><p>' + esc(r.conservation) + '</p>' : '') +
      '<p class="petit discret">Après la récolte : <a href="conservation.html">conserver le surplus</a> · <a href="carnet.html#garde-manger">garde-manger</a></p></div>';
    const maj = () => {
      const p = +$('#r-poids').value, k = p / base;
      $('#r-poids-val').textContent = g1(p) + ' g';
      $('#r-ingr').innerHTML = r.ingredients.map((i) => '<li><span class="q">' + g1(i.g * k) + ' g</span><span>' + esc(i.nom) + '</span></li>').join('');
    };
    $('#r-poids').addEventListener('input', maj);
    maj();
    // schema.org Recipe (quantités de la recette de base)
    const DIETS = { vegetarien: 'https://schema.org/VegetarianDiet', vegan: 'https://schema.org/VeganDiet', 'sans-gluten': 'https://schema.org/GlutenFreeDiet' };
    const ld = document.createElement('script'); ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Recipe', name: r.titre, description: r.chapeau, inLanguage: 'fr',
      recipeYield: r.portions + ' personnes', prepTime: 'PT' + r.preparation_min + 'M', cookTime: 'PT' + r.cuisson_min + 'M',
      totalTime: 'PT' + (r.preparation_min + r.cuisson_min + (r.repos_min || 0)) + 'M', recipeCategory: TYPES[r.type] || 'Plat',
      recipeCuisine: r.cuisine || undefined, keywords: esps.map(nomEsp).join(', ') + ', cueillette',
      suitableForDiet: (r.regimes || []).map((x) => DIETS[x]).filter(Boolean),
      recipeIngredient: r.ingredients.map((i) => g1(i.g) + ' g ' + i.nom),
      recipeInstructions: r.etapes.map((e) => ({ '@type': 'HowToStep', text: e }))
    });
    document.head.appendChild(ld);
  }

  (params.get('r') ? fiche(params.get('r')) : catalogue()).catch(() => { zone.innerHTML = '<p class="discret">Recettes indisponibles pour l’instant (réseau ?).</p>'; });
})();
