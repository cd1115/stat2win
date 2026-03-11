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

/* ================= TEAM MAPS ================= */

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

const MLB_TEAM_MAP = {
  "Arizona Diamondbacks": "ARI",
  "Atlanta Braves": "ATL",
  "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS",
  "Chicago Cubs": "CHC",
  "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN",
  "Cleveland Guardians": "CLE",
  "Colorado Rockies": "COL",
  "Detroit Tigers": "DET",
  "Houston Astros": "HOU",
  "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA",
  "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",
  "Minnesota Twins": "MIN",
  "New York Mets": "NYM",
  "New York Yankees": "NYY",
  "Oakland Athletics": "OAK",
  "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT",
  "San Diego Padres": "SD",
  "San Francisco Giants": "SF",
  "Seattle Mariners": "SEA",
  "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX",
  "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH",
};

function mapTeam(league, oddsName) {
  if (league === "NBA") return NBA_TEAM_MAP[oddsName] ?? null;
  if (league === "MLB") return MLB_TEAM_MAP[oddsName] ?? null;
  return null;
}

/* ================= EXTRACT LINES ================= */

function extractLinesFromEvent(ev) {
  const dk = (ev.bookmakers || []).find((b) => b.key === "draftkings");
  if (!dk) return null;

  const spreads = dk.markets?.find((m) => m.key === "spreads");
  const totals = dk.markets?.find((m) => m.key === "totals");

  let spreadHome = null;
  let spreadAway = null;

  if (spreads?.outcomes?.length) {
    const home = spreads.outcomes.find((o) => o.name === ev.home_team);
    const away = spreads.outcomes.find((o) => o.name === ev.away_team);
    spreadHome = home?.point ?? null;
    spreadAway = away?.point ?? null;
  }

  let total = null;
  if (totals?.outcomes?.length) {
    const over = totals.outcomes.find((o) => o.name.toLowerCase() === "over");
    total = over?.point ?? null;
  }

  if (spreadHome === null && spreadAway === null && total === null) return null;

  return { spreadHome, spreadAway, total };
}

/* ================= FETCH ODDS ================= */

async function fetchOdds(apiKey, sportKey) {
  const res = await axios.get(
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds`,
    {
      params: {
        apiKey,
        bookmakers: "draftkings",
        markets: "spreads,totals",
        oddsFormat: "american",
        dateFormat: "iso",
      },
    },
  );
  return res.data;
}

/* ================= MATCH & UPDATE ================= */

async function updateLeague(league, sportKey, apiKey) {
  const events = await fetchOdds(apiKey, sportKey);

  for (const ev of events) {
    const lines = extractLinesFromEvent(ev);
    if (!lines) continue;

    const home = mapTeam(league, ev.home_team);
    const away = mapTeam(league, ev.away_team);
    if (!home || !away) continue;

    const snapshot = await db
      .collection("games")
      .where("league", "==", league)
      .where("homeTeam", "==", home)
      .where("awayTeam", "==", away)
      .get();

    if (snapshot.empty) {
      console.log("No match:", league, home, away);
      continue;
    }

    const docRef = snapshot.docs[0].ref;

    await docRef.set(
      {
        markets: {
          spread: {
            homeLine: lines.spreadHome,
            awayLine: lines.spreadAway,
          },
          total: {
            line: lines.total,
          },
        },
        source: "draftkings",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    console.log("Updated:", league, home, away);
  }
}

/* ================= MAIN ================= */

async function run() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.error("Missing ODDS_API_KEY");
    process.exit(1);
  }

  await updateLeague("NBA", "basketball_nba", apiKey);
  await updateLeague("MLB", "baseball_mlb", apiKey);

  console.log("DONE");
}

run().catch(console.error);
