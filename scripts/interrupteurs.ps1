# Applique les interrupteurs privés (docs-prive/config-privee.json, jamais publié) au site :
# - js/interrupteurs.js : ce que le navigateur doit savoir (MW.INTERRUPTEURS) ;
# - bloc <!-- debut:anciennete --> ... <!-- fin:anciennete --> de mentions.html et data/SOURCES.md :
#   attribution exigée par la licence quand ANCIENNETE_PUBLIQUE est vrai.
# Fichier de configuration absent (autre ordinateur) = tous les interrupteurs à faux.
# Appelé par entete.ps1 (donc par publier.ps1).
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$utf8 = New-Object Text.UTF8Encoding $false
$cfgPath = Join-Path $root 'docs-prive\config-privee.json'
$cfg = $null
if (Test-Path $cfgPath) { $cfg = [IO.File]::ReadAllText($cfgPath, $utf8) | ConvertFrom-Json }
$anc = [bool]($cfg -and $cfg.ANCIENNETE_PUBLIQUE -eq $true)
$pla = [bool]($cfg -and $cfg.MODE_PLANTES_ACTIF -eq $true)

function JsTexte([string]$s) { "'" + $s.Replace('\', '\\').Replace("'", "\'") + "'" }
function Html([string]$s) { $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;') }

$attribution = ''
if ($anc) { $attribution = ([string]$cfg.ANCIENNETE_ATTRIBUTION).Replace('{ref}', [string]$cfg.ANCIENNETE_REFERENCE) }

# js/interrupteurs.js
$js = "/* Généré par scripts\interrupteurs.ps1 à partir des réglages privés : ne pas modifier à la main. */`n" +
  "(function (root) {`n  const MW = (root.MW = root.MW || {});`n" +
  "  MW.INTERRUPTEURS = { anciennete: $($anc.ToString().ToLower()), plantes: $($pla.ToString().ToLower()) };`n"
if ($anc) {
  $js += "  MW.INTERRUPTEURS.ancienneteService = $(JsTexte ([string]$cfg.ANCIENNETE_SERVICE));`n"
  $js += "  MW.INTERRUPTEURS.ancienneteAttribution = $(JsTexte $attribution);`n"
}
$js += "})(typeof window !== 'undefined' ? window : globalThis);`n"
[IO.File]::WriteAllText((Join-Path $root 'js\interrupteurs.js'), $js, $utf8)

# blocs d'attribution
function Bloc([string]$fichier, [string]$contenu) {
  $p = Join-Path $root $fichier
  $t = [IO.File]::ReadAllText($p, $utf8)
  $motif = '(?s)<!-- debut:anciennete -->.*?<!-- fin:anciennete -->'
  if ($t -notmatch $motif) { throw "$fichier : marqueurs <!-- debut:anciennete --> introuvables" }
  $t2 = [regex]::Replace($t, $motif, { param($m) '<!-- debut:anciennete -->' + $contenu + '<!-- fin:anciennete -->' }.GetNewClosure())
  if ($t2 -ne $t) { [IO.File]::WriteAllText($p, $t2, $utf8) }
}
if ($anc) {
  Bloc 'mentions.html' ("`n      <li id=""attribution-anciennete""><b>Ancienneté des forêts</b> (carte des milieux, « Pourquoi ici ? ») : " + (Html $attribution) + " Conditions : usage selon l’autorisation du SPW ; la donnée brute n’est ni redistribuée ni téléchargeable depuis Musette.</li>`n      ")
  Bloc 'data\SOURCES.md' ("`nSource : SPW, https://geoportail.wallonie.be, consultée le 12/10/2026. Licence : usage avec l’autorisation écrite du SPW (réf. $([string]$cfg.ANCIENNETE_REFERENCE)) ; la donnée brute n’est pas redistribuée. Usage sur le site : carte des milieux, « Pourquoi ici ? ».`n`nAttribution : $attribution`n")
} else {
  Bloc 'mentions.html' ''
  Bloc 'data\SOURCES.md' "`nSource : SPW, https://geoportail.wallonie.be, consultée le 12/10/2026. Licence : usage libre, redistribution et publication web interdites sans autorisation du SPW. Usage sur le site : **aucun**. La carte des milieux publiée et « Pourquoi ici ? » sont calculés sans cette couche.`n"
}
"interrupteurs : ancienneté publique = $anc ; mode plantes = $pla"
