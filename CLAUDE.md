# Contexte projet : Musette

Julien, développeur et designer web freelance (Belgique, francophone), à l'aise en HTML/CSS écrit à la main, pas en backend. Interface et textes en français, tutoiement.

Musette est un site statique installable (PWA) pour la cueillette sauvage en Wallonie : bulletin des pousses, carte des milieux (modes Champignons / Plantes et fruits, vue Plan / Réel), « Puis-je cueillir ici ? » et battues, carnet et garde-manger locaux, catalogue de recettes et conservation. Les champignons d'abord ; plantes et fruits seulement après relecture par un botaniste.

## À lire avant tout travail (privé, si présent sur ce disque)
@docs-prive/brief-claude-code.md
@docs-prive/identite-et-design.md
@docs-prive/notes-techniques.md
Aussi : `docs-prive/decisions.md` (décisions les plus récentes) et `docs-prive/autorisations-et-interrupteurs.md`. L'étude complète est dans `docs-prive/etude-sous-bois-2026-10.md` : une réflexion, pas un cahier des charges. Le dossier `docs-prive/` est privé : ne jamais le committer ni le publier.

## Architecture (sans build)
- Pages HTML à la racine. En-tête, pied et onglets dans `partials/`, recopiés par `scripts\entete.ps1`. Nom du site dans `marque.json` (appliqué par `scripts\marque.ps1`).
- `css/site.css` (pages, thèmes clair et sombre), `css/style.css` (carte). `js/` : un fichier par fonction (site, carte, droit, bulletin, carnet, garde-manger, recettes, plantes…). Leaflet 1.9.4 (cdnjs).
- Données publiques du site dans `data/` ; sources et licences dans `data/SOURCES.md`.
- Recettes : un JSON par recette dans `data/recettes/` ; l'index `data/recettes/index.json` est construit et vérifié par `scripts\recettes-index.ps1` (grammes avec décimales, jamais de fractions, statut brouillon, rappel de cuisson des morilles).
- Plantes et fruits : fichiers dans `data/plantes/` (ignoré par git), affichés en ligne seulement quand l'interrupteur correspondant est vrai.
- Interrupteurs : réglages privés appliqués par `scripts\interrupteurs.ps1` dans `js/interrupteurs.js` (généré, ne pas modifier à la main) et dans les blocs `<!-- debut:anciennete -->` des mentions et de `data/SOURCES.md`.
- PWA : `manifest.webmanifest` (ne jamais changer son `id`), `sw.js` (toute nouvelle page ou script dans COQUILLE ; jamais de cache pour les services publics, dont les photos aériennes).

## Publier
`powershell -ExecutionPolicy Bypass -File scripts\publier.ps1 "message"` : en-têtes, interrupteurs, index des recettes, garde-fou (`scripts\garde-fou.ps1`), nouvelle version du service worker, commit, push. `-Essai` vérifie sans publier. En ligne sur https://julienpiette.github.io/sous-bois-wallonie/ en 1 à 10 minutes. Le dépôt GitHub est public.

## Règles
- Ne jamais présenter un milieu favorable comme une identification ; garder les avertissements de sécurité et le Centre Antipoisons (070 245 245).
- Ne jamais masquer les forêts privées ou communales ; seules les battues du jour sont hachurées avec une alerte. Jamais de nom de propriétaire ni d'agent.
- Dépôt public : pas de méthode de calcul détaillée, de pondérations, de scores, de prix ni de projets non lancés dans les fichiers suivis.
- Ne jamais publier de donnée dérivée de l'ancienneté des forêts sans l'autorisation écrite du SPW ; ne pas inventer d'URL ou de couche SPW.
- Aucune fiche ni zone de plante ou de fruit en ligne avant la relecture par un botaniste ; jamais de plante de la famille de la carotte.
- Recettes : écrites avec nos mots, jamais copiées ; aucune recette avec des champignons crus.
- Pas de Google Maps ni de ses tuiles : photos aériennes du SPW (CC-BY 4.0, attribution affichée).
- Ne jamais contourner le garde-fou de publication.
