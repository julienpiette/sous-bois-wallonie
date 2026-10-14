# Publie le site sur GitHub Pages : en-tetes communs a jour, interrupteurs appliques, garde-fou,
# nouvelle VERSION du service worker (les telephones rafraichissent leur copie hors ligne), commit, push.
# En ligne 1 a 10 minutes apres.
# Usage : powershell -ExecutionPolicy Bypass -File scripts\publier.ps1 "ce qui a change" [-Essai]
#   -Essai : prepare et verifie (garde-fou) sans rien committer ni publier.
# Revenir en arriere : git log --oneline, puis git revert <commit> et relancer ce script.
param([string]$Message = 'Mise a jour du site', [switch]$Essai)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$o = Join-Path $env:USERPROFILE 'outils'
$env:Path = "$o\git\cmd;$o\gh\bin;" + $env:Path
Set-Location $root
& (Join-Path $PSScriptRoot 'entete.ps1') | Out-Null
git add -A
# contenu plantes et fruits (ignore par git) : publie seulement si MODE_PLANTES_ACTIF est vrai
$cfgPath = Join-Path $root 'docs-prive\config-privee.json'
if ((Test-Path $cfgPath) -and ((Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json).MODE_PLANTES_ACTIF -eq $true) -and (Test-Path (Join-Path $root 'data\plantes'))) {
  git add -f data/plantes
}
$problemes = @(& (Join-Path $PSScriptRoot 'garde-fou.ps1'))
if ($problemes.Count) {
  git reset -q
  Write-Host ''
  Write-Host 'PUBLICATION ARRETEE par le garde-fou (rien n''a ete committe ni publie) :' -ForegroundColor Red
  $problemes | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Write-Host 'Corrige ces fichiers (ou les interrupteurs de docs-prive\config-privee.json, avec l''autorisation correspondante), puis relance.'
  exit 2
}
if ($Essai) { git reset -q; 'Essai : garde-fou OK, rien n''a ete publie.'; return }
if (-not (git status --porcelain)) { 'Rien a publier.'; return }
$utf8 = New-Object Text.UTF8Encoding $false
$sw = Join-Path $root 'sw.js'
$v = 'sb-' + (Get-Date -Format 'yyyyMMdd-HHmm')
$t = [regex]::Replace([IO.File]::ReadAllText($sw, $utf8), "const VERSION = '[^']*';", "const VERSION = '$v';")
[IO.File]::WriteAllText($sw, $t, $utf8)
git add sw.js
git commit -q -m $Message
git push -q origin main
if ($LASTEXITCODE) { throw 'echec du push' }
"Publie ($v) : https://$((git remote get-url origin) -replace '^https://github.com/([^/]+)/([^/.]+)(\.git)?$', '$1.github.io/$2')/"
