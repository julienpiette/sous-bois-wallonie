# Petit serveur statique local (sans Python ni Node).
# Usage : powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 [-Port 8080]
param([int]$Port = 8080)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8';
  '.json'='application/json'; '.geojson'='application/geo+json'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml';
  '.ico'='image/x-icon'; '.webmanifest'='application/manifest+json'; '.ics'='text/calendar; charset=utf-8'; '.txt'='text/plain; charset=utf-8';
  '.xml'='application/xml' }
$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$Port/")
$http.Start()
Write-Host "Sous-bois Wallonie : http://localhost:$Port/  (Ctrl+C pour arrêter)"
try {
  while ($http.IsListening) {
    $ctx = $http.GetContext()
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($rel -eq '') { $rel = 'index.html' }
      $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
      $res = $ctx.Response
      # seuls les fichiers du site sont servis (jamais sources/, scripts/ : données brutes sous licence)
      $public = ($rel -match '^[a-z0-9-]+\.html$') -or ($rel -match '^(manifest\.webmanifest|sw\.js|robots\.txt|sitemap\.xml)$') -or ($rel -match '^(css|js|data|icons|img)/')
      if ($public -and $path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($path)
        $ext = [IO.Path]::GetExtension($path).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        # tuiles : cache navigateur d'un jour ; le reste toujours revalidé (le service worker gère le hors ligne)
        $res.Headers.Add('Cache-Control', $(if ($rel -match '^data/tuiles/') { 'public, max-age=86400' } else { 'no-cache' }))
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $res.StatusCode = 404 }
      $res.Close()
    } catch {
      # client parti en cours de route (téléphone, tunnel) : on ignore et on continue
      try { $ctx.Response.Abort() } catch {}
    }
  }
} finally { $http.Stop() }
