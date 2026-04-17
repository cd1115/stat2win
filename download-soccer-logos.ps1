# ── Download Soccer Logos from ESPN CDN ───────────────────────────────────────
# Corre desde: E:\Stat2Win\stat2win-web
# Logos se guardan en: public\teams\soccer\

$outputDir = "public\teams\soccer"

if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    Write-Host "Carpeta creada: $outputDir" -ForegroundColor Green
}

# slug => nombre de archivo (sin espacios, sin caracteres especiales)
$teams = @{
    # EPL
    "arsenal"                    = "Arsenal"
    "chelsea"                    = "Chelsea"
    "liverpool"                  = "Liverpool"
    "manchester-city"            = "Manchester_City"
    "manchester-united"          = "Manchester_United"
    "tottenham-hotspur"          = "Tottenham"
    "newcastle-united"           = "Newcastle"
    "aston-villa"                = "Aston_Villa"
    "west-ham-united"            = "West_Ham"
    "brighton-hove-albion"       = "Brighton"
    "wolverhampton-wanderers"    = "Wolves"
    "everton"                    = "Everton"
    "crystal-palace"             = "Crystal_Palace"
    "brentford"                  = "Brentford"
    "fulham"                     = "Fulham"
    "nottingham-forest"          = "Nottingham_Forest"
    "bournemouth"                = "Bournemouth"
    "leicester-city"             = "Leicester"
    "ipswich-town"               = "Ipswich"
    "southampton"                = "Southampton"
    # La Liga
    "real-madrid"                = "Real_Madrid"
    "fc-barcelona"               = "Barcelona"
    "atletico-de-madrid"         = "Atletico_Madrid"
    "sevilla"                    = "Sevilla"
    "real-betis"                 = "Real_Betis"
    "valencia"                   = "Valencia"
    "athletic-club"              = "Athletic_Club"
    "real-sociedad"              = "Real_Sociedad"
    "villarreal"                 = "Villarreal"
    "rc-celta"                   = "Celta_Vigo"
    "ca-osasuna"                 = "Osasuna"
    "girona-fc"                  = "Girona"
    "getafe"                     = "Getafe"
    "rayo-vallecano"             = "Rayo_Vallecano"
    "rcd-mallorca"               = "Mallorca"
    "deportivo-alaves"           = "Alaves"
    "ud-las-palmas"              = "Las_Palmas"
    "cd-leganes"                 = "Leganes"
    "rcd-espanyol"               = "Espanyol"
    "real-valladolid"            = "Valladolid"
    # Bundesliga
    "fc-bayern-munchen"          = "Bayern_Munich"
    "borussia-dortmund"          = "Borussia_Dortmund"
    "rb-leipzig"                 = "RB_Leipzig"
    "bayer-04-leverkusen"        = "Bayer_Leverkusen"
    "eintracht-frankfurt"        = "Eintracht_Frankfurt"
    "vfl-wolfsburg"              = "Wolfsburg"
    "sc-freiburg"                = "Freiburg"
    "1899-hoffenheim"            = "Hoffenheim"
    "borussia-monchengladbach"   = "Monchengladbach"
    "1-fsv-mainz-05"             = "Mainz"
    "vfb-stuttgart"              = "Stuttgart"
    "fc-augsburg"                = "Augsburg"
    "1-fc-union-berlin"          = "Union_Berlin"
    "sv-werder-bremen"           = "Werder_Bremen"
    "hamburger-sv"               = "Hamburger_SV"
    "holstein-kiel"              = "Holstein_Kiel"
    "fc-st-pauli"                = "St_Pauli"
    # Serie A
    "juventus"                   = "Juventus"
    "ac-milan"                   = "AC_Milan"
    "inter-milan"                = "Inter_Milan"
    "ssc-napoli"                 = "Napoli"
    "as-roma"                    = "Roma"
    "ss-lazio"                   = "Lazio"
    "atalanta-bc"                = "Atalanta"
    "acf-fiorentina"             = "Fiorentina"
    "torino"                     = "Torino"
    "bologna"                    = "Bologna"
    "udinese"                    = "Udinese"
    "ac-monza"                   = "Monza"
    "cagliari"                   = "Cagliari"
    "genoa"                      = "Genoa"
    "empoli"                     = "Empoli"
    "como-1907"                  = "Como"
    "parma"                      = "Parma"
    "us-lecce"                   = "Lecce"
    "venezia"                    = "Venezia"
    "hellas-verona"              = "Hellas_Verona"
    # Ligue 1
    "paris-saint-germain"        = "PSG"
    "olympique-de-marseille"     = "Marseille"
    "as-monaco"                  = "Monaco"
    "olympique-lyonnais"         = "Lyon"
    "losc-lille"                 = "Lille"
    "ogc-nice"                   = "Nice"
    "rc-lens"                    = "Lens"
    "stade-rennais-fc"           = "Rennes"
    "rc-strasbourg-alsace"       = "Strasbourg"
    "stade-de-reims"             = "Reims"
    "stade-brestois-29"          = "Brest"
    "fc-nantes"                  = "Nantes"
    "montpellier-hsc"            = "Montpellier"
    "toulouse-fc"                = "Toulouse"
    "angers-sco"                 = "Angers"
    "le-havre-ac"                = "Le_Havre"
    "as-saint-etienne"           = "Saint_Etienne"
    "aj-auxerre"                 = "Auxerre"
    # Champions League extra
    "sporting-cp"                = "Sporting_CP"
    "sl-benfica"                 = "Benfica"
    "fc-porto"                   = "Porto"
    "ajax"                       = "Ajax"
    "psv-eindhoven"              = "PSV"
    "celtic"                     = "Celtic"
    "rangers"                    = "Rangers"
}

$success = 0
$failed  = 0
$failedList = @()

Write-Host ""
Write-Host "Descargando logos Soccer desde ESPN CDN..." -ForegroundColor Cyan
Write-Host "Total equipos: $($teams.Count)" -ForegroundColor DarkGray
Write-Host "─────────────────────────────────────────────" -ForegroundColor DarkGray

foreach ($slug in ($teams.Keys | Sort-Object)) {
    $name    = $teams[$slug]
    $url     = "https://a.espncdn.com/i/teamlogos/soccer/500/$slug.png"
    $outFile = "$outputDir\$name.png"

    try {
        Invoke-WebRequest -Uri $url -OutFile $outFile -TimeoutSec 15 -ErrorAction Stop
        $size = (Get-Item $outFile).Length
        if ($size -lt 500) {
            # File too small = probably a 404 placeholder
            Remove-Item $outFile -Force
            Write-Host "  ~ $name  (logo not found, skipped)" -ForegroundColor DarkYellow
            $failedList += $name
            $failed++
        } else {
            Write-Host "  ✓ $name  ($([math]::Round($size/1024, 1)) KB)" -ForegroundColor Green
            $success++
        }
    }
    catch {
        Write-Host "  ✗ $name  FAILED" -ForegroundColor Red
        $failedList += $name
        $failed++
    }
}

Write-Host "─────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
Write-Host "✓ Descargados: $success" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "✗ Fallidos:   $failed" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Equipos sin logo:" -ForegroundColor Yellow
    $failedList | ForEach-Object { Write-Host "  - $_" -ForegroundColor DarkGray }
}
Write-Host ""
Write-Host "Logos guardados en: $((Get-Location).Path)\$outputDir" -ForegroundColor Cyan
