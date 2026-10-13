# Contexte projet : Sous-bois Wallonie

Julien, développeur/designer web freelance (Belgique, francophone), à l'aise en HTML/CSS écrit à la main, pas backend. Interface et textes en français.

## But
Compagnon du cueilleur wallon (site statique installable, PWA) en quatre piliers, d'après l'étude du 13/10/2026 (https://claude.ai/artifact/AJ1qRuWCFc4JQn9Ab6UvTT) : Quand (bulletin des pousses), Où (carte du potentiel de site par espèce : cèpes, girolles, chanterelles en tube, morilles, trompettes, pieds de mouton), Le droit (« Puis-je cueillir ici ? », battues), Le secret (carnet local, sans compte). Ton : tutoiement, discret, précis ; jamais « spot », « hack », « miracle ». Une seule couleur signal (orange girolle).

## Architecture
Site multi-pages sans build. En-tête, pied et onglets mobiles dans partials/*.html, recopiés dans chaque page par `scripts\entete.ps1` (marqueurs `<!-- debut:x -->…<!-- fin:x -->`) : modifier les partials, puis relancer le script.
- Pages : index, bulletin, carte, droit, battues, carnet, guide, especes, avant-de-manger, glossaire, materiel (liens partenaires dans js/produits.js : champ `lien`, rel="sponsored", mention d'affiliation obligatoire), offre, pros, approche, feuille-de-route, mentions, hors-ligne.
- css/site.css : jetons de couleur (thème sombre auto, html.clair = toujours clair), en-tête, onglets, composants partagés (.statut, .alerte-battue, .feu, .verdict-tete, dl.pourquoi) ; règles de contenu préfixées .page. css/style.css : page carte uniquement (#panel, #fiche, alerte, hachures).
- js/site.js (menu, PWA : service worker + invitation à installer, réseau, `[data-lien]`/`[data-texte]` depuis js/site-config.js, glossaire, calendrier, produits) ; js/droit.js (MW.droit : verdict + battues, services SPW LIMITES_DNF, CHASSE_TERRIT_ANONYM, CONSNAT en direct + data/communes.json) ; js/pourquoi.js (data/facteurs + sigles.json + WALOUS + ancienneté en direct) ; js/bulletin.js (data/massifs.json, Open-Meteo) ; js/carnet.js (localStorage `mw-coins`, partagé avec la carte ; export chiffré AES-GCM).
- PWA : manifest.webmanifest, sw.js (changer VERSION à chaque mise en ligne ; toute nouvelle page/script dans COQUILLE), icons/.
- Règles de cueillette citées depuis environnement.wallonie.be et wallonie.be (vérifiées le 12/10/2026). Centre Antipoisons 070 245 245.
- Ne jamais masquer les forêts privées/communales sur la carte (on informe + contact du cantonnement) ; seules les fermetures pour la chasse du jour choisi sont hachurées en rouge avec une alerte. Jamais de nom d'agent ni de propriétaire.
Carte : carte.html + css/style.css + js/{config,geo,weather,model,render,tuiles,droit,pourquoi,main}.js. Leaflet 1.9.4 (cdnjs). Aucun build. Modules compatibles Node (test: `node -e` en chargeant les fichiers).
- config.js : emprise, contour approximatif, grille météo, services WMS, paramètres par espèce. `MW.FEATURES.weather` (false actuellement : carte = potentiel de site seul, 5 classes `MW.CLASSES`) ; true réactive la météo.
- model.js : I = P x D x T x S x G x C (pluie décalée, lessivage, température, sécheresse, gel, calendrier).
- weather.js : grille ~0,25° x 0,38° (≈58 pts), Open-Meteo (sans clé), cache localStorage.
- render.js : IDW + masque du contour + canvas Web Mercator ; charge data/potentiel-<id>.png (gris, Web Mercator sur BBOX, 0-255).
- tuiles.js : potentiel de site en tuiles XYZ data/tuiles/<id>/{z}/{x}/{y}.png (gris = rang, alpha = forêt, zoom 7-12), recoloration navigateur, agrandissement lissé au-delà du zoom 12 ; data/tuiles/index.json.
- main.js : UI, choix du jour (aujourd'hui/demain/week-end) et zones fermées pour la chasse (pane 'fermetures', motif SVG #hachures, alerte selon la vue), popup au clic, fiche « Puis-je cueillir ici ? » + « Pourquoi ici ? » (bouton, onglet « Ici ? », carte.html?ici=1 avec GPS), carte.html?ajout=1, WMS manager, « Mes coins », overlay CartoWeb, position dans l'URL (#z/lat/lon).
- Tests sans Node : Chrome headless piloté par le protocole DevTools (profil hors du dossier scratchpad, sinon CacheStorage échoue).

## Étude stratégique
Lis docs-prive/brief-claude-code.md avant tout travail sur une nouvelle fonctionnalité.
L'étude complète est dans docs-prive/etude-sous-bois-2026-10.md : à consulter pour le contexte,
ne pas l'implémenter en entier. Ce dossier est privé, ne jamais le committer.
Publier les petits commits sans redemander d'accord à chaque fois (scripts\publier.ps1) ; demander seulement pour les cas risqués listés dans le brief.

## En ligne
Dépôt public https://github.com/julienpiette/sous-bois-wallonie, publié par GitHub Pages : https://julienpiette.github.io/sous-bois-wallonie/ (l'icône du téléphone de Julien y est liée).
Publier : `powershell -ExecutionPolicy Bypass -File scripts\publier.ps1 "message"` (en-têtes, VERSION de sw.js, commit, push ; en ligne en 1-10 min). Git et gh portables dans %USERPROFILE%\outils (PATH utilisateur). Commits signés julienpiette / adresse noreply GitHub (jamais l'e-mail perso). sources/ jamais versionné. Régénérer les tuiles alourdit l'historique (~140 Mo à chaque fois) : le faire rarement.

## Règles
- Ne jamais présenter un potentiel comme une identification ; garder l'avertissement de sécurité.
- Seuils météo = hypothèses : les calibrer avec le journal (modelIndex vs résultat).
- Ne pas inventer d'URLs/noms de couches SPW : les vérifier (GetCapabilities).

## Feuille de route (dans l'ordre)
1. Lancer le diagnostic « Tester les services » ; corriger URLs/noms de couches WMS dans config.js (sols, hydro, géologie, pente MNP, MNT). Si CORS bloque GetCapabilities, prévoir un petit proxy local ou un script de téléchargement.
2. Remplacer le contour approximatif par le contour officiel de la Wallonie (SPW / GeoJSON), simplifié.
3. [V1 faite le 12/10/2026 : scripts/potentiel.py + regles_especes.py, voir README] Script (Python/GDAL ou rasterio, dans /scripts) : télécharger carte des sols, essences/forêts, pente, exposition (MNT), hydrographie, géologie ; produire pour chaque espèce un PNG gris 25 m en Web Mercator sur BBOX = potentiel de site. Poids sol/humidité/exposition/pente : cèpe 40/30/20/10, girolle 35/35/20/10, morille 45/25/20/10, trompette 25/40/20/15, pied de mouton 40/30/20/10 ; filtre par essence hôte. Déposer dans data/.
   Ajouts du 12/10/2026 (demande de Julien) : ancienneté des forêts (poids 30), pénalité d'accès (routes, rail, bâti, urbain ; pas pour les morilles), résineux = feuillus pour cèpe/girolle. Validation : scripts/gbif.py + valider.py (AUC vs autres champignons forestiers).
4. Calibrer les seuils avec « Mes coins ».
5. [Fait le 13/10/2026] Refonte selon l'étude : bulletin, droit, battues, carnet, pages projet (offre, pros, approche, feuille de route, mentions), PWA, onglets mobiles.
6. À compléter par Julien : js/site-config.js (contact, inscription bulletin, prévente, éditeur, hébergeur), liens partenaires, plus de communes dans data/communes.json ; hébergement fixe en https puis appli Android (TWA).
7. V2 (selon la prévente) : coins jumeaux, alerte « coin mûr », calendrier .ics abonnable par massif, hors ligne par massif, NL/DE, bolet bai.
