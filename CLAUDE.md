# Contexte projet : Musette

Julien, développeur et designer web freelance (Belgique, francophone), à l'aise en HTML/CSS écrit à la main, pas en backend. Interface et textes en français, tutoiement.

Musette est un site statique installable (PWA) pour la cueillette sauvage en Wallonie : bulletin des pousses, carte des milieux, « Puis-je cueillir ici ? » et battues, carnet et garde-manger locaux, recettes et conservation. Les champignons d'abord ; plantes et fruits seulement après relecture par un botaniste.

## À lire avant tout travail (privé, si présent sur ce disque)
@docs-prive/brief-claude-code.md
@docs-prive/identite-et-design.md
@docs-prive/notes-techniques.md
L'étude complète est dans `docs-prive/etude-sous-bois-2026-10.md` : une réflexion, pas un cahier des charges. Le dossier `docs-prive/` est privé : ne jamais le committer ni le publier.

## Architecture (sans build)
- Pages HTML à la racine. En-tête, pied et onglets dans `partials/`, recopiés par `scripts\entete.ps1`. Nom du site dans `marque.json` (appliqué par `scripts\marque.ps1`).
- `css/site.css` (pages, thèmes clair et sombre), `css/style.css` (carte). `js/` : un fichier par fonction (site, carte, droit, bulletin, carnet, garde-manger, recettes…). Leaflet 1.9.4 (cdnjs).
- Données publiques du site dans `data/` ; sources et licences dans `data/SOURCES.md`.
- PWA : `manifest.webmanifest` (ne jamais changer son `id`), `sw.js` (toute nouvelle page ou script dans COQUILLE).

## Publier
`powershell -ExecutionPolicy Bypass -File scripts\publier.ps1 "message"` : en-têtes, nouvelle version du service worker, commit, push. En ligne sur https://julienpiette.github.io/sous-bois-wallonie/ en 1 à 10 minutes. Le dépôt GitHub est public.

## Règles
- Ne jamais présenter un milieu favorable comme une identification ; garder les avertissements de sécurité et le Centre Antipoisons (070 245 245).
- Ne jamais masquer les forêts privées ou communales ; seules les battues du jour sont hachurées avec une alerte. Jamais de nom de propriétaire ni d'agent.
- Dépôt public : pas de méthode de calcul détaillée, de pondérations, de scores, de prix ni de projets non lancés dans les fichiers suivis.
- Ne jamais publier de donnée dérivée de l'ancienneté des forêts ; ne pas inventer d'URL ou de couche SPW.
