# Construit data/recettes/index.json (index léger du catalogue : ce qu'il faut pour filtrer et afficher les cartes)
# à partir des fichiers data/recettes/<id>.json, et vérifie chaque recette (champs, grammes, sécurité).
# Une recette invalide arrête le script (donc publier.ps1). Appelé par entete.ps1.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dir = Join-Path $root 'data\recettes'
$utf8 = New-Object Text.UTF8Encoding $false
$TYPES = 'entree', 'plat', 'soupe', 'sauce', 'accompagnement', 'douceur', 'conservation'
$ESPECES = 'cepe', 'girolle', 'chanterelle', 'morille', 'trompette', 'pied'
$SAISONS = 'printemps', 'ete', 'automne', 'hiver'
$NIVEAUX = 'facile', 'moyen', 'exigeant'
$REGIMES = 'vegetarien', 'vegan', 'sans-gluten'
$erreurs = New-Object Collections.Generic.List[string]
$liste = New-Object Collections.Generic.List[object]

foreach ($f in Get-ChildItem $dir -Filter *.json | Where-Object { $_.Name -ne 'index.json' } | Sort-Object Name) {
  $id = $f.BaseName
  try { $r = [IO.File]::ReadAllText($f.FullName, $utf8) | ConvertFrom-Json } catch { $erreurs.Add("$id : JSON illisible"); continue }
  $e = { param($m) $erreurs.Add("$id : $m") }
  if ($r.id -ne $id) { & $e 'id différent du nom de fichier' }
  foreach ($k in 'titre', 'chapeau', 'type', 'niveau', 'conservation') { if (-not [string]$r.$k) { & $e "champ $k manquant" } }
  if ($r.statut -ne 'brouillon' -and $r.statut -ne 'relue') { & $e 'statut doit être brouillon (ou relue après relecture)' }
  if ($r.famille -ne 'champignon') { & $e 'famille doit être champignon (plantes et fruits : relecture botaniste)' }
  if ($TYPES -notcontains $r.type) { & $e "type inconnu : $($r.type)" }
  if ($NIVEAUX -notcontains $r.niveau) { & $e "niveau inconnu : $($r.niveau)" }
  $esp = @($r.especes); if (-not $esp.Count) { & $e 'especes vide' }
  foreach ($x in $esp) { if ($ESPECES -notcontains $x) { & $e "espèce inconnue : $x" } }
  foreach ($x in @($r.saisons)) { if ($SAISONS -notcontains $x) { & $e "saison inconnue : $x" } }
  foreach ($x in @($r.regimes)) { if ($REGIMES -notcontains $x) { & $e "régime inconnu : $x" } }
  foreach ($k in 'preparation_min', 'cuisson_min', 'portions', 'base_g') { if (-not ($r.$k -is [ValueType]) -or $r.$k -lt 0) { & $e "$k doit être un nombre" } }
  if (@($r.etapes).Count -lt 3) { & $e 'moins de 3 étapes' }
  $baseSum = 0.0
  foreach ($i in @($r.ingredients)) {
    if (-not ($i.g -is [ValueType]) -or $i.g -le 0) { & $e "quantité invalide : $($i.nom)" }
    if ($i.base) { $baseSum += $i.g }
  }
  if ([math]::Abs($baseSum - $r.base_g) -gt 0.05) { & $e "base_g ($($r.base_g)) différent de la somme des champignons ($baseSum)" }
  $texte = ($r.titre, $r.chapeau, (@($r.ingredients) | ForEach-Object nom), @($r.etapes), $r.conservation, $r.securite) -join ' '
  if ($texte -match '\d\s*/\s*\d|[½¼¾⅓⅔⅛]') { & $e 'fraction trouvée (quantités en grammes avec décimales uniquement)' }
  if (((@($r.ingredients) | ForEach-Object nom) -join ' ') -match '(?i)\b(cuill[eè]re|tasse|verre|pinc[ée]e|soupçon|gousse|botte|brin)s?\b') { & $e 'mesure non pondérale dans les ingrédients (utiliser des grammes)' }
  if ($esp -contains 'morille') {
    if (-not [string]$r.securite -or [string]$r.securite -notmatch '(?i)cuisson') { & $e 'morille : champ securite avec la cuisson complète obligatoire' }
    if ((@($r.etapes) -join ' ') -notmatch '(?i)jamais crue|cuisson complète|bien cuite') { & $e 'morille : les étapes doivent rappeler la cuisson complète' }
  }
  $mots = (($r.titre, $r.cuisine, (@($r.ingredients) | ForEach-Object nom)) -join ' ').ToLower()
  $liste.Add([ordered]@{
      id = $id; titre = [string]$r.titre; chapeau = [string]$r.chapeau; statut = [string]$r.statut
      especes = @($esp); type = [string]$r.type; saisons = @($r.saisons); cuisine = [string]$r.cuisine; niveau = [string]$r.niveau
      duree = [int]($r.preparation_min + $r.cuisson_min + $(if ($r.repos_min) { $r.repos_min } else { 0 }))
      regimes = @($r.regimes); congelable = [bool]$r.congelable; mots = $mots
    })
}
if ($erreurs.Count) { $erreurs | ForEach-Object { Write-Warning $_ }; throw "recettes : $($erreurs.Count) problème(s), index non écrit" }
$json = ConvertTo-Json @{ recettes = $liste.ToArray() } -Depth 5 -Compress
[IO.File]::WriteAllText((Join-Path $dir 'index.json'), $json, $utf8)
"recettes : $($liste.Count) dans l'index"
