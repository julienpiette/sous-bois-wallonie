# Recopie les éléments communs (partials/entete.html, onglets.html, pied.html) dans toutes les pages .html,
# entre les marqueurs <!-- debut:entete --> ... <!-- fin:entete --> (idem onglets, pied),
# et marque le lien de la page courante (aria-current="page").
# Usage : powershell -ExecutionPolicy Bypass -File scripts\entete.ps1
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& (Join-Path $PSScriptRoot 'marque.ps1')   # nom du site (marque.json) d'abord
$utf8 = New-Object Text.UTF8Encoding $false
$parts = @{}
foreach ($n in 'entete', 'onglets', 'pied') { $parts[$n] = [IO.File]::ReadAllText((Join-Path $root "partials\$n.html"), $utf8).TrimEnd() }
foreach ($f in Get-ChildItem $root -Filter *.html) {
  $t = [IO.File]::ReadAllText($f.FullName, $utf8)
  $avant = $t.Length
  foreach ($n in $parts.Keys) {
    $bloc = $parts[$n].Replace('href="' + $f.Name + '"', 'href="' + $f.Name + '" aria-current="page"')
    $motif = '(?s)<!-- debut:' + $n + ' -->.*?<!-- fin:' + $n + ' -->'
    $t = [regex]::Replace($t, $motif, { param($m) "<!-- debut:$n -->`n" + $bloc + "`n<!-- fin:$n -->" }.GetNewClosure())
  }
  if ($t.Length -lt 200) { Write-Warning "$($f.Name) : résultat vide, fichier non modifié"; continue }
  [IO.File]::WriteAllText($f.FullName, $t, $utf8)
  "{0,-24} {1,6} -> {2,6} caractères" -f $f.Name, $avant, $t.Length
}
