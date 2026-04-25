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
  {
    slug: "brighton-hove-albion",
    queries: ["Brighton & Hove Albion", "Brighton", "Brighton and Hove Albion"],
  },
  {
    slug: "athletic-club",
    queries: ["Athletic Bilbao", "Athletic Club", "Athletic Club de Bilbao"],
  },
  {
    slug: "as-roma",
    queries: ["AS Roma", "Roma", "Roma FC"],
  },
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
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }

            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error("JSON inválido"));
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

function scoreTeam(candidate, wantedName) {
  const wanted = normalize(wantedName);
  const team = normalize(candidate?.strTeam || "");
  const alt = normalize(candidate?.strAlternate || "");
  const league = normalize(candidate?.strLeague || "");

  let score = 0;

  if (team === wanted) score += 100;
  if (alt === wanted) score += 90;

  if (team.includes(wanted)) score += 40;
  if (wanted.includes(team)) score += 30;

  if (alt.includes(wanted)) score += 35;
  if (wanted.includes(alt)) score += 25;

  if (league.includes("premier")) score += 5;
  if (league.includes("liga")) score += 5;
  if (league.includes("bundesliga")) score += 5;
  if (league.includes("serie a")) score += 5;

  return score;
}

function pickBestTeam(teams, wantedName) {
  if (!Array.isArray(teams) || teams.length === 0) return null;

  const ranked = [...teams]
    .map((t) => ({ team: t, score: scoreTeam(t, wantedName) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.team || null;
}

async function fetchBadgeUrl(possibleQueries) {
  for (const q of possibleQueries) {
    try {
      const url = `${API_BASE}/searchteams.php?t=${encodeURIComponent(q)}`;
      const json = await getJson(url);
      const found = pickBestTeam(json?.teams || [], q);

      if (found) {
        const badge = found.strBadge || found.strLogo || null;
        if (badge) {
          return { badge, usedQuery: q, matched: found.strTeam || q };
        }
      }
    } catch (err) {
      console.log(`  intento fallido con "${q}" -> ${err.message}`);
    }

    await sleep(1800);
  }

  return null;
}

async function main() {
  let ok = 0;
  let fail = 0;

  for (const team of TEAMS) {
    const outFile = path.join(OUT_DIR, `${team.slug}.png`);

    try {
      const result = await fetchBadgeUrl(team.queries);

      if (!result?.badge) {
        console.log(`✗ ${team.slug} -> no se encontró badge`);
        fail++;
        await sleep(2500);
        continue;
      }

      await downloadFile(result.badge, outFile);
      console.log(
        `✓ ${team.slug} -> query="${result.usedQuery}" match="${result.matched}"`,
      );
      ok++;
    } catch (err) {
      console.log(`✗ ${team.slug} -> ${err.message}`);
      fail++;
    }

    await sleep(2500);
  }

  console.log(`Listo. OK: ${ok} | Fail: ${fail}`);
}

main().catch((err) => {
  console.error("Error general:", err);
  process.exit(1);
});
