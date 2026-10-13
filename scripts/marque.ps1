# Applique le nom du site defini dans marque.json a toutes les pages, partials, scripts et au manifest.
# Pour changer de nom : modifier "nom" dans marque.json, puis lancer scripts\publier.ps1 (qui appelle ce script).
# Le dernier nom applique est memorise dans scripts\marque-appliquee.json : c'est lui qui est remplace.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$utf8 = New-Object Text.UTF8Encoding $false
$etat = Join-Path $PSScriptRoot 'marque-appliquee.json'
$m = [IO.File]::ReadAllText((Join-Path $root 'marque.json'), $utf8) | ConvertFrom-Json
$a = [IO.File]::ReadAllText($etat, $utf8) | ConvertFrom-Json
if ($a.nom -ceq $m.nom) { return }
$cibles = @(Get-ChildItem $root -Filter *.html) + @(Get-ChildItem (Join-Path $root 'partials') -Filter *.html) +
  @(Get-ChildItem (Join-Path $root 'js') -Filter *.js) + @(Get-Item (Join-Path $root 'manifest.webmanifest'))
foreach ($f in $cibles) {
  $t = [IO.File]::ReadAllText($f.FullName, $utf8)
  # nom suivi de la region (titres) puis nom seul ; sensible a la casse : le nom commun en minuscules n'est pas touche
  $u = $t.Replace($a.nom + ' ' + $a.region, $m.nom).Replace($a.nom, $m.nom)
  if ($u -cne $t) { [IO.File]::WriteAllText($f.FullName, $u, $utf8); "nom : $($f.Name)" }
}
[IO.File]::WriteAllText($etat, (@{ nom = $m.nom; region = $m.region } | ConvertTo-Json), $utf8)
