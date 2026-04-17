import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_DIR = path.join(__dirname, "public", "teams", "soccer");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const API_BASE = "https://www.thesportsdb.com/api/v1/json/123";

const TEAMS = [
  // EPL
  { slug: "arsenal", query: "Arsenal" },
  { slug: "chelsea", query: "Chelsea" },
  { slug: "liverpool", query: "Liverpool" },
  { slug: "manchester-city", query: "Manchester City" },
  { slug: "manchester-united", query: "Manchester United" },
  { slug: "tottenham-hotspur", query: "Tottenham Hotspur" },
  { slug: "newcastle-united", query: "Newcastle United" },
  { slug: "aston-villa", query: "Aston Villa" },
  { slug: "west-ham-united", query: "West Ham United" },
  { slug: "brighton-hove-albion", query: "Brighton & Hove Albion" },
  { slug: "wolverhampton-wanderers", query: "Wolverhampton Wanderers" },
  { slug: "everton", query: "Everton" },
  { slug: "crystal-palace", query: "Crystal Palace" },
  { slug: "brentford", query: "Brentford" },
  { slug: "fulham", query: "Fulham" },
  { slug: "nottingham-forest", query: "Nottingham Forest" },
  { slug: "bournemouth", query: "Bournemouth" },
  { slug: "leicester-city", query: "Leicester City" },

  // La Liga
  { slug: "real-madrid", query: "Real Madrid" },
  { slug: "fc-barcelona", query: "Barcelona" },
  { slug: "atletico-de-madrid", query: "Atletico Madrid" },
  { slug: "sevilla", query: "Sevilla" },
  { slug: "real-betis", query: "Real Betis" },
  { slug: "valencia", query: "Valencia" },
  { slug: "athletic-club", query: "Athletic Club" },
  { slug: "real-sociedad", query: "Real Sociedad" },
  { slug: "villarreal", query: "Villarreal" },
  { slug: "rc-celta", query: "Celta Vigo" },

  // Bundesliga
  { slug: "fc-bayern-munchen", query: "Bayern Munich" },
  { slug: "borussia-dortmund", query: "Borussia Dortmund" },
  { slug: "rb-leipzig", query: "RB Leipzig" },
  { slug: "bayer-04-leverkusen", query: "Bayer Leverkusen" },
  { slug: "eintracht-frankfurt", query: "Eintracht Frankfurt" },
  { slug: "vfl-wolfsburg", query: "Wolfsburg" },
  { slug: "sc-freiburg", query: "SC Freiburg" },
  { slug: "vfb-stuttgart", query: "VfB Stuttgart" },
  { slug: "sv-werder-bremen", query: "Werder Bremen" },
  { slug: "hamburger-sv", query: "Hamburger SV" },
  { slug: "fc-st-pauli", query: "St. Pauli" },

  // Serie A
  { slug: "juventus", query: "Juventus" },
  { slug: "ac-milan", query: "AC Milan" },
  { slug: "inter-milan", query: "Inter" },
  { slug: "ssc-napoli", query: "Napoli" },
  { slug: "as-roma", query: "Roma" },
  { slug: "ss-lazio", query: "Lazio" },
  { slug: "atalanta-bc", query: "Atalanta" },
  { slug: "acf-fiorentina", query: "Fiorentina" },
  { slug: "torino", query: "Torino" },
  { slug: "bologna", query: "Bologna" },
  { slug: "udinese", query: "Udinese" },
  { slug: "cagliari", query: "Cagliari" },

  // Ligue 1
  { slug: "paris-saint-germain", query: "Paris Saint-Germain" },
  { slug: "olympique-de-marseille", query: "Marseille" },
  { slug: "as-monaco", query: "Monaco" },
  { slug: "olympique-lyonnais", query: "Lyon" },
  { slug: "losc-lille", query: "Lille" },
  { slug: "ogc-nice", query: "Nice" },
  { slug: "rc-lens", query: "Lens" },
  { slug: "stade-rennais-fc", query: "Rennes" },
  { slug: "stade-de-reims", query: "Reims" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "application/json",
          },
        },
        (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            if ((res.statusCode || 0) >= 400) {
              reject(new Error(`HTTP ${res.statusCode} for ${url}`));
              return;
            }

            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject(new Error(`JSON inválido para ${url}`));
            }
          });
        },
      )
      .on("error", reject);
  });
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        },
        (res) => {
          const status = res.statusCode || 0;
          const type = String(res.headers["content-type"] || "");

          if (status !== 200) {
            res.resume();
            reject(new Error(`HTTP ${status}`));
            return;
          }

          if (!type.includes("image")) {
            res.resume();
            reject(new Error(`content-type inválido: ${type}`));
            return;
          }

          const file = fs.createWriteStream(destination);
          res.pipe(file);

          file.on("finish", () => {
            file.close(() => {
              const size = fs.existsSync(destination)
                ? fs.statSync(destination).size
                : 0;

              if (size < 1000) {
                try {
                  fs.unlinkSync(destination);
                } catch {}
                reject(new Error(`archivo inválido (${size} bytes)`));
                return;
              }

              resolve();
            });
          });

          file.on("error", (err) => {
            try {
              if (fs.existsSync(destination)) fs.unlinkSync(destination);
            } catch {}
            reject(err);
          });
        },
      )
      .on("error", reject);
  });
}

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickBestTeam(teams, wantedName) {
  if (!Array.isArray(teams) || teams.length === 0) return null;

  const wanted = normalize(wantedName);

  const exact = teams.find((t) => normalize(t.strTeam) === wanted);
  if (exact) return exact;

  const altExact = teams.find((t) => normalize(t.strAlternate) === wanted);
  if (altExact) return altExact;

  const contains = teams.find((t) => {
    const team = normalize(t.strTeam);
    const alt = normalize(t.strAlternate);
    return (
      team.includes(wanted) ||
      wanted.includes(team) ||
      alt.includes(wanted) ||
      wanted.includes(alt)
    );
  });
  if (contains) return contains;

  return teams[0];
}

async function fetchBadgeUrl(teamName) {
  const url = `${API_BASE}/searchteams.php?t=${encodeURIComponent(teamName)}`;
  const json = await getJson(url);
  const found = pickBestTeam(json?.teams || [], teamName);

  if (!found) return null;

  return found.strBadge || found.strLogo || found.strTeamBadge || null;
}

async function main() {
  console.log(`Guardando logos en: ${OUT_DIR}`);
  let ok = 0;
  let fail = 0;

  for (const team of TEAMS) {
    const outFile = path.join(OUT_DIR, `${team.slug}.png`);

    try {
      const badgeUrl = await fetchBadgeUrl(team.query);

      if (!badgeUrl) {
        console.log(`✗ ${team.slug} -> sin badge para "${team.query}"`);
        fail++;
        await sleep(350);
        continue;
      }

      await downloadFile(badgeUrl, outFile);
      console.log(`✓ ${team.slug}`);
      ok++;
    } catch (err) {
      console.log(`✗ ${team.slug} -> ${err.message}`);
      fail++;
    }

    await sleep(350);
  }

  console.log("");
  console.log(`Listo. OK: ${ok} | Fail: ${fail}`);
}

main().catch((err) => {
  console.error("Error general:", err);
  process.exit(1);
});
