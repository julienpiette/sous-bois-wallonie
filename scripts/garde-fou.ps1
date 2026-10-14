# Garde-fou appelé par publier.ps1 après « git add » : vérifie les fichiers qui vont être publiés
# (index git) contre les interrupteurs privés (docs-prive/config-privee.json ; absent = tout à faux).
# Renvoie la liste des problèmes (vide = publication autorisée). Usage seul :
#   powershell -ExecutionPolicy Bypass -File scripts\garde-fou.ps1   (après git add -A)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$utf8 = New-Object Text.UTF8Encoding $false
$cfgPath = Join-Path $root 'docs-prive\config-privee.json'
$cfg = $null
if (Test-Path $cfgPath) { $cfg = [IO.File]::ReadAllText($cfgPath, $utf8) | ConvertFrom-Json }
$anc = [bool]($cfg -and $cfg.ANCIENNETE_PUBLIQUE -eq $true)
$pla = [bool]($cfg -and $cfg.MODE_PLANTES_ACTIF -eq $true)
$pb = New-Object Collections.Generic.List[string]

Push-Location $root
try {
  # fichiers publiés = index git (mode, empreinte, étape, chemin)
  $index = @(git -c core.quotepath=off ls-files -s) | ForEach-Object {
    $m = [regex]::Match($_, '^\d+ ([0-9a-f]{40}) \d\t(.+)$'); if ($m.Success) { [pscustomobject]@{ h = $m.Groups[1].Value; p = $m.Groups[2].Value } }
  }
  $soi = 'scripts/garde-fou.ps1'

  # 1. Chemins
  foreach ($f in $index) {
    if ($f.p -match '^docs-prive(/|$)') { $pb.Add("dossier privé : $($f.p)") }
    if (-not $anc -and $f.p -match '(?i)anciennete|forets?_anciennes|sorties-completes|NE-PAS-PUBLIER') { $pb.Add("ancienneté (chemin) : $($f.p)") }
    if (-not $pla -and $f.p -match '^data/plantes/') { $pb.Add("plantes et fruits (chemin) : $($f.p)") }
  }

  # 2. Contenu des fichiers texte
  $motifsAnc = @('FORETANC', 'forets_anciennes', 'CLASS_CODE', 'complete-avec-anciennete', '"anciennete"\s*:\s*true', '\banciennete\s*:\s*true', 'ancienneteService\s*=')
  $motifsPla = @('"famille"\s*:\s*"(plante|fruit)"', "\bfamille\s*:\s*'(plante|fruit)'", 'Contenu de test')
  foreach ($f in $index) {
    if ($f.p -eq $soi -or $f.p -notmatch '\.(html|js|json|geojson|md|css|txt|webmanifest|xml|svg|ics|csv)$') { continue }
    $chemin = Join-Path $root $f.p
    if (-not (Test-Path -LiteralPath $chemin)) { continue }
    $t = [IO.File]::ReadAllText($chemin, $utf8)
    if (-not $anc) { foreach ($m in $motifsAnc) { if ($t -cmatch $m) { $pb.Add("ancienneté (« $($Matches[0]) ») dans $($f.p)") } } }
    if (-not $pla) { foreach ($m in $motifsPla) { if ($t -cmatch $m) { $pb.Add("plantes et fruits (« $($Matches[0]) ») dans $($f.p)") } } }
  }

  # 3. Sorties calculées avec l'ancienneté : empreintes de la version complète (docs-prive/sorties-completes)
  $emp = Join-Path $root 'docs-prive\sorties-completes\empreintes.txt'
  if (-not $anc -and (Test-Path $emp)) {
    $set = New-Object 'Collections.Generic.HashSet[string]'
    foreach ($l in [IO.File]::ReadAllLines($emp)) { if ($l) { [void]$set.Add($l.Trim()) } }
    $n = 0
    foreach ($f in $index) { if ($set.Contains($f.h)) { $n++; if ($n -le 5) { $pb.Add("sortie calculée avec l'ancienneté : $($f.p)") } } }
    if ($n -gt 5) { $pb.Add("... et $($n - 5) autres fichiers calculés avec l'ancienneté") }
  }

  # 4. Cohérence des interrupteurs publiés
  $ij = Join-Path $root 'js\interrupteurs.js'
  $it = if (Test-Path $ij) { [IO.File]::ReadAllText($ij, $utf8) } else { '' }
  if ($it -notmatch "anciennete: $($anc.ToString().ToLower())\b") { $pb.Add('js/interrupteurs.js ne correspond pas à ANCIENNETE_PUBLIQUE : relancer scripts\entete.ps1') }
  if ($it -notmatch "plantes: $($pla.ToString().ToLower())\b") { $pb.Add('js/interrupteurs.js ne correspond pas à MODE_PLANTES_ACTIF : relancer scripts\entete.ps1') }

  # 5. Ancienneté publique : autorisation présente (ou risque accepté par écrit pour le prototype) et attribution jamais masquée
  $proto = [string]$(if ($cfg) { $cfg.PROTOTYPE_RISQUE_ACCEPTE } else { '' })
  if ($anc) {
    $dir = Join-Path $root 'docs-prive\autorisations'
    $aut = @(Get-ChildItem $dir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '^LISEZ-MOI' })
    $autorise = $aut.Count -and [string]$cfg.ANCIENNETE_REFERENCE
    if (-not $autorise -and -not $proto) { $pb.Add('ANCIENNETE_PUBLIQUE est vrai sans autorisation dans docs-prive/autorisations/ ni ANCIENNETE_REFERENCE (ni PROTOTYPE_RISQUE_ACCEPTE)') }
    if (-not $autorise -and $proto) { Write-Host 'ATTENTION : ancienneté des forêts publiée SANS autorisation du SPW (prototype, risque accepté : voir docs-prive\autorisations-et-interrupteurs.md, section E).' -ForegroundColor Yellow }
    $men = [IO.File]::ReadAllText((Join-Path $root 'mentions.html'), $utf8)
    if ($men -notmatch 'id="attribution-anciennete"') { $pb.Add('attribution de l''ancienneté absente de mentions.html') }
    $src = [IO.File]::ReadAllText((Join-Path $root 'data\SOURCES.md'), $utf8)
    if ($src -notmatch '(?s)debut:anciennete -->.*Attribution :.*<!-- fin:anciennete') { $pb.Add('attribution de l''ancienneté absente de data/SOURCES.md') }
  }
  # 6. Plantes et fruits publiés : relecture botanique faite, ou risque accepté pour le prototype
  if ($pla) {
    $nonRelues = @(Get-ChildItem (Join-Path $root 'data\plantes') -Filter *.json -ErrorAction SilentlyContinue | Where-Object { [IO.File]::ReadAllText($_.FullName, $utf8) -match '"relu_botaniste"\s*:\s*false' })
    if ($nonRelues.Count -and -not $proto) { $pb.Add("MODE_PLANTES_ACTIF est vrai mais $($nonRelues.Count) fichier(s) de data/plantes ne sont pas relus par un botaniste (ni PROTOTYPE_RISQUE_ACCEPTE)") }
    if ($nonRelues.Count -and $proto) { Write-Host "ATTENTION : $($nonRelues.Count) fichier(s) plantes et fruits publiés SANS relecture botanique (prototype, bandeau « test » affiché)." -ForegroundColor Yellow }
    foreach ($f in Get-ChildItem (Join-Path $root 'data\plantes') -Filter *.json -ErrorAction SilentlyContinue) {
      if ([IO.File]::ReadAllText($f.FullName, $utf8) -match '(?i)apiac|ombellif') { $pb.Add("plante de la famille de la carotte : data/plantes/$($f.Name) (interdit, même en prototype)") }
    }
  }
} finally { Pop-Location }
$pb
