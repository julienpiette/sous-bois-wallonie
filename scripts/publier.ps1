# Publie le site sur GitHub Pages : en-tetes communs a jour, nouvelle VERSION du service worker
# (les telephones rafraichissent leur copie hors ligne), commit, push. En ligne 1 a 10 minutes apres.
# Usage : powershell -ExecutionPolicy Bypass -File scripts\publier.ps1 "ce qui a change"
# Revenir en arriere : git log --oneline, puis git revert <commit> et relancer ce script.
param([string]$Message = 'Mise a jour du site')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$o = Join-Path $env:USERPROFILE 'outils'
$env:Path = "$o\git\cmd;$o\gh\bin;" + $env:Path
Set-Location $root
& (Join-Path $PSScriptRoot 'entete.ps1') | Out-Null
git add -A
if (-not (git status --porcelain)) { 'Rien a publier.'; return }
$utf8 = New-Object Text.UTF8Encoding $false
$sw = Join-Path $root 'sw.js'
$v = 'sb-' + (Get-Date -Format 'yyyyMMdd-HHmm')
$t = [regex]::Replace([IO.File]::ReadAllText($sw, $utf8), "const VERSION = '[^']*';", "const VERSION = '$v';")
[IO.File]::WriteAllText($sw, $t, $utf8)
git add -A
git commit -q -m $Message
git push -q origin main
if ($LASTEXITCODE) { throw 'echec du push' }
"Publie ($v) : https://$((git remote get-url origin) -replace '^https://github.com/([^/]+)/([^/.]+)(\.git)?$', '$1.github.io/$2')/"
