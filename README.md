# Sous-bois Wallonie

Le compagnon du cueilleur wallon (site statique installable, sans backend) : **quand** ça pousse (bulletin), **où** (carte des milieux), **le droit** (« Puis-je cueillir ici ? », battues), **le secret** (carnet local, sans compte). Concept issu de l'étude « Sous-bois Wallonie : étude, concept et plans » (13/10/2026).

## Lancer
Windows, sans Python ni Node :
```
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1
```
Puis ouvrir http://localhost:8080. Ne pas ouvrir les pages en double-clic (tuiles, données et service worker en ont besoin). Le serveur ne sert que les fichiers du site (jamais `sources/`, `scripts/`, `partials/`).
Démo sur téléphone sans hébergement : `scripts\demo.bat` (serveur + tunnel Cloudflare, adresse https://….trycloudflare.com qui change à chaque lancement).

## Pages
- Cueillir : `index.html` (accueil, alerte battues du jour, mini-bulletin), `bulletin.html` (feu par massif et par espèce), `carte.html` (carte des milieux + zones fermées + « Ici ? »), `droit.html` (outil « Puis-je cueillir ici ? » + règles), `battues.html` (21 jours par massif ou autour de soi, export .ics), `carnet.html` (coins, sauvegarde chiffrée, transmission, bilan).
- Apprendre : `guide.html`, `especes.html`, `avant-de-manger.html` (Centre Antipoisons 070 245 245), `glossaire.html`, `materiel.html`.
- Le projet : `approche.html` (méthode, scores GBIF, données, vie privée), `feuille-de-route.html`, `offre.html` (Gratuit / Pass 4 € / Panier 24 €/an / à vie 79 €, 49 € fondateurs ; rien n'est en vente), `pros.html` (gîtes, offices, communes, Bois ouverts, cercles, presse), `mentions.html`, `hors-ligne.html`.
- **En-tête, pied et onglets communs** : modifier `partials/entete.html`, `pied.html`, `onglets.html`, puis `powershell -ExecutionPolicy Bypass -File scripts\entete.ps1` (recopie entre les marqueurs `<!-- debut:… -->` / `<!-- fin:… -->` et marque la page courante).
- **À compléter** dans `js/site-config.js` : e-mail de contact, lien d'inscription au bulletin, page de prévente, éditeur (nom, adresse, BCE), hébergeur. Tant que c'est vide, les boutons concernés sont désactivés avec un texte « bientôt ».
- **Liens partenaires** : coller les URL d'affiliation dans `js/produits.js` (champ `lien`, rel="sponsored"). Mention d'affiliation sur la page Matériel, dans le pied et les mentions.

## Appli installable (PWA)
`manifest.webmanifest` + `sw.js` + `icons/`. Installable depuis Chrome/Edge (bouton « Installer ») ou Safari (Partager → Sur l'écran d'accueil) ; nécessite https (ou localhost).
- Service worker : pages réseau d'abord ; CSS/JS/JSON réseau d'abord avec repli sur le cache après 3 s ; tuiles et fonds de carte déjà vus en cache (plafonnés) ; **jamais** de cache pour les services publics (chasse, propriétés, météo, recherche).
- **Changer `VERSION` dans sw.js à chaque mise en ligne.** Toute page ou script ajouté doit figurer dans `COQUILLE` (sinon l'installation échoue).
- Étape suivante prévue : emballer pour Android (TWA / Bubblewrap) quand le site aura une adresse fixe.

## Droit de cueillir et battues (js/droit.js)
Interrogation en direct, depuis le navigateur, des services ArcGIS du SPW (CORS ouvert) :
- `FAUNE_FLORE/LIMITES_DNF` : propriétés gérées par le DNF (catégorie domaniale, communale, privée soumise…) et triages (cantonnement, téléphone). On affiche la fonction et le téléphone du cantonnement, jamais le nom d'un agent ni d'un propriétaire.
- `FAUNE_FLORE/CHASSE_TERRIT_ANONYM` (CC-BY 4.0, mis à jour chaque jour) : dates de battue / affût / autre chasse **avec fermeture**.
- `FAUNE_FLORE/CONSNAT` : réserves.
- `data/communes.json` : règlements communaux connus (sources et date) ; à enrichir.
- Principe : les forêts privées et communales **restent sur la carte** (on informe et on donne le contact) ; seules les fermetures pour la chasse du jour choisi sont hachurées en rouge par-dessus le potentiel, avec une alerte. Résultat toujours **indicatif** : l'affiche sur place fait foi.

## « Pourquoi ici ? » (js/pourquoi.js)
Tuiles `data/facteurs/12/` (R/G = index du sigle de sol, B = exposition + pente) et `data/sigles.json`, produits par `scripts\facteurs.bat` ; type de forêt WALOUS et ancienneté (service SPW interrogé en direct, non republié).

## Bulletin (js/bulletin.js)
11 massifs (`data/massifs.json`), météo Open-Meteo (gratuit en usage **non commercial** seulement : à revoir avant toute vente), état par espèce via `MW.model.state`. Seuils = hypothèses (cèpe : pluie sur 26 j, ~13 °C sur 20 j, d'après bioRxiv 2025).

## Produire les potentiels de site (data/tuiles/)
Nécessite QGIS 3.44 LTR (installé dans `C:\Program Files\QGIS 3.44.14`, fournit Python + GDAL).
```
scripts\telecharger_sources.bat   & rem ~1,6 Go de données ouvertes dans sources\ (reprise possible)
scripts\potentiel.bat             & rem calcul (cache dans sources\derive\), --force pour tout refaire
scripts\facteurs.bat              & rem tuiles « Pourquoi ici ? » + data/sigles.json
```
- Sources (licences vérifiées dans Metawal) : Carte Numérique des Sols de Wallonie 1:20 000 (CNSW), WALOUS 2023 (feuillus / résineux), Réseau hydrographique wallon, © SPW, CC-BY 4.0 ; relief Copernicus DEM GLO-30 (30 m).
- Règles par espèce (poids, sols, humidité, exposition, pente, hôtes) : `scripts/regles_especes.py`. **Ce sont des hypothèses** à calibrer avec le carnet.
- Étalonnage : le score brut est remplacé par son rang parmi les forêts wallonnes. Affichage en 3 classes (Bon = top 40 %, Très bon = top 20 %, Exceptionnel = top 5 %) : classement **relatif**, pas une probabilité de trouvaille.
- Calcul en 25 m (Lambert 2008), tuiles XYZ zoom 7-12 (~120 Mo), agrandissement lissé au-delà. Routes, cours d'eau et noms de l'IGN (CartoWeb overlay) par-dessus.
- Ancienneté des forêts (SPW) : poids 30. **Licence** : interdiction de redistribuer la donnée ou de la publier via un service web ; seule la carte de potentiel qui en dérive est publiée, l'ancienneté brute est interrogée en direct (« Pourquoi ici ? »). À confirmer avec le SPW avant une mise en ligne publique.
- Accès : potentiel fortement réduit près des grandes routes, voies ferrées, zones bâties et en ville (sauf morilles).
- Validation GBIF (`scripts\gbif.bat` puis `scripts\valider.bat`), AUC face aux autres champignons forestiers (12/10/2026) : morilles 0,76 ; chanterelles en tube 0,69 ; girolles 0,64 ; trompettes 0,58 ; pieds de mouton 0,58 ; cèpes 0,57 (0,5 = hasard).
- Non utilisés : Principaux Types de Sols 1:250 000 (licence restreinte) ; géologie simplifiée ; MNT LiDAR 1 m (42 Go).

## Météo sur la carte
Désactivée sur la carte (`MW.FEATURES.weather = false` dans js/config.js) : la météo vit dans le bulletin. Passer à `true` réactive le curseur de jour et l'indice météo par espèce sur la carte.

## Limites connues
- Pas d'essence précise (chêne, hêtre, frêne…) : WALOUS ne distingue que feuillus / résineux.
- Relief Copernicus = modèle de surface (inclut la canopée) : pente et exposition approximatives en forêt.
- Zones « NC » de la carte des sols (dont certains domaines militaires boisés) : sol neutre.
- Contour de la Wallonie approximatif.
- Règlements communaux : quelques communes seulement ; les autres renvoient vers l'administration communale.
- Un potentiel n'est pas une identification.
