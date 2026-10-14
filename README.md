# Musette

Cueillette sauvage en Wallonie : quand ça pousse, où tu as le droit de cueillir, et quoi faire de ta récolte. Un site statique installable comme une appli, sans compte et sans publicité.

**En ligne :** https://julienpiette.github.io/sous-bois-wallonie/

## Ce que Musette fait
- **Bulletin des pousses** : un feu par massif et par espèce, selon la pluie, la douceur et la saison.
- **Carte des milieux** : les forêts favorables à chaque espèce, avec routes et cours d’eau par-dessus ; recherche de lieux et « Me localiser » au-dessus de la carte ; bouton **Plan / Réel** pour passer à la photo aérienne du SPW.
- **Deux modes** sur la carte : **Champignons** et **Plantes et fruits** (8 plantes et fruits pour l’instant, fiches en cinq étapes et milieux sur la carte ; elles attendent la relecture d’un botaniste et le disent).
- **Puis-je cueillir ici ?** : forêt domaniale, communale ou privée, réserve, règlement communal connu, et le contact du cantonnement. Les forêts privées restent visibles : on informe, on ne cache pas.
- **Battues** : les zones fermées pour la chasse le jour choisi, hachurées sur la carte avec une alerte ; calendrier sur trois semaines et export vers l’agenda.
- **Carnet** : tes coins restent sur ton téléphone ; sauvegarde chiffrée, transmission, bilan de saison sans aucun lieu.
- **Garde-manger** : tes bocaux et sachets avec une date « à consommer avant », stockés localement.
- **Plus de cent recettes** de champignons, filtrables (espèce, saison, type de plat, durée, niveau, régime, conservation), dont les quantités suivent le poids de ta récolte ; toutes encore en brouillon. Et la **conservation** en six méthodes avec leurs règles de sécurité.
- **Fiches espèces** en cinq étapes (trouver, reconnaître, cueillir, cuisiner, conserver), « Avant de manger », glossaire, matériel.

## Ce que Musette refuse
Pas d’identification par photo, pas de coins publics, pas de classement au poids, pas de publicité ni de revente de données. Une carte n’identifie aucune espèce : au moindre doute, on ne mange pas. Intoxication : Centre Antipoisons **070 245 245**.

## Installer sur un téléphone
Android : menu de Chrome, « Installer l’application ». iPhone : bouton Partager de Safari, « Sur l’écran d’accueil ».

## Lancer en local
Sous Windows, sans dépendance : `powershell -ExecutionPolicy Bypass -File scripts\serve.ps1`, puis http://localhost:8080.

Publier : `powershell -ExecutionPolicy Bypass -File scripts\publier.ps1 "ce qui a changé"`. Avant chaque publication, un garde-fou (`scripts\garde-fou.ps1`) vérifie que rien de ce qui attend une autorisation ou une relecture ne part en ligne ; `-Essai` lance la vérification sans publier.

## Données et licences
Voir [data/SOURCES.md](data/SOURCES.md) et la page Mentions du site.
