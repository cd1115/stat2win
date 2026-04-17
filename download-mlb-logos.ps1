# ── Download MLB Logos from ESPN CDN ──────────────────────────────────────────
# Corre este script desde: E:\Stat2Win\stat2win-web
# Los logos se guardan en: public\teams\mlb\
 
$outputDir = "public\teams\mlb"
 
# Crear carpeta si no existe
if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    Write-Host "Carpeta creada: $outputDir" -ForegroundColor Green
}
 
# Mapeo: TuArchivo.png → abreviacion ESPN
$teams = @{
    "ARI" = "ari"   # Arizona Diamondbacks
    "ATL" = "atl"   # Atlanta Braves
    "BAL" = "bal"   # Baltimore Orioles
    "BOS" = "bos"   # Boston Red Sox
    "CHC" = "chc"   # Chicago Cubs
    "CWS" = "cws"   # Chicago White Sox
    "CIN" = "cin"   # Cincinnati Reds
    "CLE" = "cle"   # Cleveland Guardians
    "COL" = "col"   # Colorado Rockies
    "DET" = "det"   # Detroit Tigers
    "HOU" = "hou"   # Houston Astros
    "KC"  = "kc"    # Kansas City Royals
    "LAD" = "lad"   # Los Angeles Dodgers
    "LAA" = "laa"   # Los Angeles Angels
    "MIA" = "mia"   # Miami Marlins
    "MIL" = "mil"   # Milwaukee Brewers
    "MIN" = "min"   # Minnesota Twins
    "NYM" = "nym"   # New York Mets
    "NYY" = "nyy"   # New York Yankees
    "OAK" = "oak"   # Oakland Athletics
    "PHI" = "phi"   # Philadelphia Phillies
    "PIT" = "pit"   # Pittsburgh Pirates
    "SD"  = "sd"    # San Diego Padres
    "SEA" = "sea"   # Seattle Mariners
    "SF"  = "sf"    # San Francisco Giants
    "STL" = "stl"   # St. Louis Cardinals
    "TB"  = "tb"    # Tampa Bay Rays
    "TEX" = "tex"   # Texas Rangers
    "TOR" = "tor"   # Toronto Blue Jays
    "WSH" = "wsh"   # Washington Nationals
}
 
$success = 0
$failed = 0
 
Write-Host ""
Write-Host "Descargando logos MLB desde ESPN CDN..." -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────" -ForegroundColor DarkGray
 
foreach ($abbr in ($teams.Keys | Sort-Object)) {
    $espn = $teams[$abbr]
    $url = "https://a.espncdn.com/i/teamlogos/mlb/500/$espn.png"
    $outFile = "$outputDir\$abbr.png"
 
    try {
        Invoke-WebRequest -Uri $url -OutFile $outFile -TimeoutSec 15 -ErrorAction Stop
        $size = (Get-Item $outFile).Length
        Write-Host "  ✓ $abbr.png  ($([math]::Round($size/1024, 1)) KB)" -ForegroundColor Green
        $success++
    }
    catch {
        Write-Host "  ✗ $abbr  FAILED — $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}
 
Write-Host "─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Completado: $success descargados, $failed fallidos" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host ""
 
if ($failed -gt 0) {
    Write-Host "Para los fallidos, prueba esta URL alternativa:" -ForegroundColor Yellow
    Write-Host "  https://www.mlbstatic.com/team-logos/{teamId}.svg" -ForegroundColor DarkGray
    Write-Host ""
}
 
Write-Host "Logos guardados en: $((Get-Location).Path)\$outputDir" -ForegroundColor Cyan
 