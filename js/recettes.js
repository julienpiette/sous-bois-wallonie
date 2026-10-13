/* Recettes : liste (filtrable par espèce) et fiche détaillée avec recalcul selon le poids récolté.
   Données : data/recettes/index.json + un fichier JSON par recette. Quantités en grammes, une décimale,
   jamais de fractions. Balisage schema.org Recipe ajouté pour la fiche affichée. */
(function () {
  const MW = window.MW, $ = (s) => document.querySelector(s);
  const zone = $('#recettes');
  if (!zone) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const g1 = (x) => x.toLocaleString('fr-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nomEsp = (id) => (MW.SPECIES.find((s) => s.id === id) || { name: id }).name;
  // sosies affichés dans le bandeau de sécurité (même contenu que les fiches espèces)
  const SOSIES = {
    cepe: 'bolet amer, bolets à pores rouges (dont le bolet de Satan, toxique)',
    girolle: 'fausse girolle, cortinaires orangés (certains mortels)',
    chanterelle: 'cortinaires bruns (certains mortels)',
    morille: 'gyromitre (mortelle) ; morilles toxiques crues',
    trompette: 'peu de sosies dangereux',
    pied: 'peu de sosies dangereux'
  };
  const bandeau = (esp) => '<details class="securite"><summary>Sécurité : sosies et Centre Antipoisons</summary><div>' +
    '<p><b>Sosies de : ' + esc(nomEsp(esp).toLowerCase()) + '</b> : ' + esc(SOSIES[esp] || 'voir la fiche espèce') + '. Chaque exemplaire doit être identifié avec certitude, par un humain qui sait en cas de doute.</p>' +
    '<p>Intoxication : Centre Antipoisons <a href="tel:070245245">070 245 245</a> (24 h/24). <a href="avant-de-manger.html">Avant de manger</a> · <a href="especes.html#' + esc(esp) + '">fiche espèce</a></p></div></details>';

  const params = new URLSearchParams(location.search);
  if (params.get('r') && $('#r-hero')) $('#r-hero').hidden = true;
  async function charger(id) { const r = await fetch('data/recettes/' + encodeURIComponent(id) + '.json'); if (!r.ok) throw new Error(id); return r.json(); }

  async function liste() {
    const idx = await (await fetch('data/recettes/index.json')).json();
    const toutes = await Promise.all(idx.recettes.map(charger));
    const esp = params.get('espece'), poids = params.get('poids');
    const choix = esp ? toutes.filter((r) => r.espece === esp) : toutes;
    let html = '';
    if (esp) html += '<p class="discret">Recettes pour : <b>' + esc(nomEsp(esp)) + '</b> · <a href="recettes.html">toutes les recettes</a></p>';
    if (!choix.length) html += '<p class="discret">Pas encore de recette pour cette espèce. En attendant, la fiche espèce dit comment la cuisiner : <a href="especes.html#' + esc(esp) + '">voir la fiche</a>.</p>';
    html += '<div class="grille deux">' + choix.map((r) => '<a class="carte" href="recettes.html?r=' + encodeURIComponent(r.id) + (poids ? '&poids=' + encodeURIComponent(poids) : '') + '">' +
      (r.statut === 'brouillon' ? '<span class="brouillon">Brouillon</span>' : '') +
      '<h3 style="margin-top:8px">' + esc(r.titre) + '</h3><p class="discret">' + esc(r.chapeau) + '</p>' +
      '<p class="meta-r"><span>' + esc(nomEsp(r.espece)) + '</span><span>' + (r.preparation_min + r.cuisson_min) + ' min</span><span>' + esc(r.niveau) + '</span></p></a>').join('') + '</div>';
    zone.innerHTML = html;
  }

  async function fiche(id) {
    const r = await charger(id);
    document.title = r.titre + ' · ' + document.title.split(' · ').pop();
    const base = r.base_g, depart = Math.min(3000, Math.max(50, +(params.get('poids') || base) || base));
    zone.innerHTML = '<p><a href="recettes.html">Toutes les recettes</a></p>' +
      (r.statut === 'brouillon' ? '<span class="brouillon">Brouillon : recette en cours de test</span>' : '') +
      '<h1 style="margin-top:10px">' + esc(r.titre) + '</h1><p class="chapeau">' + esc(r.chapeau) + '</p>' +
      '<p class="meta-r"><span>' + esc(nomEsp(r.espece)) + '</span><span>Préparation ' + r.preparation_min + ' min</span><span>Cuisson ' + r.cuisson_min + ' min</span><span>' + esc(r.niveau) + '</span></p>' +
      bandeau(r.espece) +
      '<div class="recette">' +
      '<label class="poids"><span>Poids de ta récolte : <output id="r-poids-val">' + g1(depart) + ' g</output></span>' +
      '<input id="r-poids" type="range" min="50" max="3000" step="10" value="' + depart + '" aria-label="Poids de ta récolte en grammes">' +
      '<span class="petit discret">Les quantités se recalculent. Recette de base : ' + g1(base) + ' g pour ' + r.portions + ' personnes.</span></label>' +
      '<h2 style="font-size:22px">Ingrédients</h2><ul class="ingr" id="r-ingr"></ul>' +
      '<h2 style="font-size:22px">Étapes</h2><ol class="etapes-r">' + r.etapes.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ol>' +
      '<p class="petit discret">Après la récolte : <a href="conservation.html">conserver le surplus</a> · <a href="carnet.html#garde-manger">garde-manger</a></p></div>';
    const maj = () => {
      const p = +$('#r-poids').value, k = p / base;
      $('#r-poids-val').textContent = g1(p) + ' g';
      $('#r-ingr').innerHTML = r.ingredients.map((i) => '<li><span class="q">' + g1(i.g * k) + ' g</span><span>' + esc(i.nom) + '</span></li>').join('');
      return k;
    };
    $('#r-poids').addEventListener('input', maj);
    maj();
    // schema.org Recipe (quantités de la recette de base)
    const ld = document.createElement('script'); ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Recipe', name: r.titre, description: r.chapeau, inLanguage: 'fr',
      recipeYield: r.portions + ' personnes', prepTime: 'PT' + r.preparation_min + 'M', cookTime: 'PT' + r.cuisson_min + 'M',
      totalTime: 'PT' + (r.preparation_min + r.cuisson_min) + 'M', recipeCategory: 'Plat', keywords: nomEsp(r.espece) + ', cueillette',
      recipeIngredient: r.ingredients.map((i) => g1(i.g) + ' g ' + i.nom),
      recipeInstructions: r.etapes.map((e) => ({ '@type': 'HowToStep', text: e }))
    });
    document.head.appendChild(ld);
  }

  (params.get('r') ? fiche(params.get('r')) : liste()).catch(() => { zone.innerHTML = '<p class="discret">Recettes indisponibles pour l’instant (réseau ?).</p>'; });
})();
