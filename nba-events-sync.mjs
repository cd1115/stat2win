import axios from "axios";
import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(
  fs.readFileSync(new URL("./serviceAccountKey.json", import.meta.url), "utf8"),
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

function weekIdFromDate(d) {
  const date = new Date(d);
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target - firstThursday;
  const week = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
  const year = target.getUTCFullYear();
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// The Odds API devuelve nombres completos.
// Nosotros guardaremos ABBR estándar NBA para tu schema.
const NBA_TEAM_MAP = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC",
  "LA Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
};

function abbr(name) {
  return NBA_TEAM_MAP[name] ?? null;
}

async function fetchEventsNBA(apiKey) {
  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/events`;
  const res = await axios.get(url, {
    params: { apiKey, dateFormat: "iso" },
    timeout: 20000,
  });
  return res.data; // [{id, sport_key, commence_time, home_team, away_team}, ...]
}

async function run() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.error("Missing ODDS_API_KEY");
    process.exit(1);
  }

  const events = await fetchEventsNBA(apiKey);
  let upserted = 0;
  let skipped = 0;

  for (const ev of events) {
    const home = abbr(ev.home_team);
    const away = abbr(ev.away_team);

    if (!home || !away) {
      console.log("TEAM MAP missing:", ev.home_team, "vs", ev.away_team);
      skipped++;
      continue;
    }

    const weekId = weekIdFromDate(ev.commence_time);
    const yyyymmdd = ev.commence_time.slice(0, 10).replaceAll("-", "");
    const gameId = `${yyyymmdd}_${ev.id}`.slice(0, 25);
    const dateKey = ev.commence_time.slice(0, 10).replaceAll("-", ""); // YYYYMMDD
    const matchKey = `NBA_${dateKey}_${home}_${away}`;

    const docId = `NBA_${weekId}_${gameId}`;

    await db
      .collection("games")
      .doc(docId)
      .set(
        {
          league: "NBA",
          sport: "NBA",
          weekId,
          gameId,
          matchKey, // 👈 AÑADE ESTO
          homeTeam: home,
          awayTeam: away,
          startTime: admin.firestore.Timestamp.fromDate(
            new Date(ev.commence_time),
          ),
          status: "scheduled",
          scoreHome: null,
          scoreAway: null,
          source: "oddsapi",
          oddsEventId: ev.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    upserted++;
  }

  console.log("NBA events -> upserted:", upserted, "skipped:", skipped);
  console.log("DONE");
}

run().catch((e) => {
  console.error("NBA events sync error:", e?.response?.status, e?.message || e);
  process.exit(1);
});
