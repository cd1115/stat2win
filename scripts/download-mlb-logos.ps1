$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $projectRoot "public\teams\mlb"

if (!(Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$logos = @{
    "ARI" = "diamondbacks.png"
    "ATL" = "braves.png"
    "BAL" = "orioles.png"
    "BOS" = "redSox.png"
    "CHC" = "cubs.png"
    "CWS" = "whiteSox.png"
    "CIN" = "reds.png"
    "CLE" = "indians.png"
    "COL" = "rockies.png"
    "DET" = "tigers.png"
    "HOU" = "astros.png"
    "KC"  = "royals.png"
    "LAA" = "angels.png"
    "LAD" = "dodgers.png"
    "MIA" = "marlins.png"
    "MIL" = "brewers.png"
    "MIN" = "twins.png"
    "NYM" = "mets.png"
    "NYY" = "yankees.png"
    "OAK" = "athletics.png"
    "PHI" = "phillies.png"
    "PIT" = "pirates.png"
    "SD"  = "padres.png"
    "SEA" = "mariners.png"
    "SF"  = "giants.png"
    "STL" = "cardinals.png"
    "TB"  = "rays.png"
    "TEX" = "rangers.png"
    "TOR" = "blueJays.png"
    "WSH" = "nationals.png"
}

$base = "https://raw.githubusercontent.com/klunn91/team-logos/master/MLB"

Write-Host "Descargando logos MLB en: $destDir"
Write-Host ""

foreach ($code in $logos.Keys) {
    $fileName = $logos[$code]
    $url = "$base/$fileName"
    $outFile = Join-Path $destDir "$code.png"

    try {
        Invoke-WebRequest -Uri $url -OutFile $outFile
        Write-Host "OK  $code -> $outFile"
    }
    catch {
        Write-Host "ERROR $code desde $url" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Listo. Logos guardados en $destDir"