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
  const h2h = dk.markets?.find((m) => m.key === "h2h");

  let spreadHome = null;
  let spreadAway = null;

  if (spreads?.outcomes?.length) {
    const home = spreads.outcomes.find((o) => o.name === ev.home_team);
    const away = spreads.outcomes.find((o) => o.name === ev.away_team);
    spreadHome = typeof home?.point === "number" ? home.point : null;
    spreadAway = typeof away?.point === "number" ? away.point : null;
  }

  let total = null;
  if (totals?.outcomes?.length) {
    const over = totals.outcomes.find(
      (o) => String(o.name).toLowerCase() === "over",
    );
    total = typeof over?.point === "number" ? over.point : null;

    if (total === null) {
      const any = totals.outcomes.find((o) => typeof o.point === "number");
      total = any?.point ?? null;
    }
  }

  let moneylineHome = null;
  let moneylineAway = null;

  if (h2h?.outcomes?.length) {
    const home = h2h.outcomes.find((o) => o.name === ev.home_team);
    const away = h2h.outcomes.find((o) => o.name === ev.away_team);

    moneylineHome = typeof home?.price === "number" ? home.price : null;
    moneylineAway = typeof away?.price === "number" ? away.price : null;
  }

  if (
    spreadHome === null &&
    spreadAway === null &&
    total === null &&
    moneylineHome === null &&
    moneylineAway === null
  ) {
    return null;
  }

  return {
    spreadHome,
    spreadAway,
    total,
    moneylineHome,
    moneylineAway,
  };
}

/* ================= FETCH ODDS ================= */

async function fetchOdds(apiKey, sportKey) {
  const res = await axios.get(
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds`,
    {
      params: {
        apiKey,
        bookmakers: "draftkings",
        markets: "h2h,spreads,totals",
        oddsFormat: "american",
        dateFormat: "iso",
      },
      timeout: 20000,
    },
  );

  const remaining =
    res.headers["x-requests-remaining"] ?? res.headers["X-Requests-Remaining"];
  const used = res.headers["x-requests-used"] ?? res.headers["X-Requests-Used"];

  console.log(
    `[fetchOdds] ${sportKey} | used=${used ?? "?"} remaining=${remaining ?? "?"}`,
  );

  return res.data;
}

/* ================= MATCH & UPDATE ================= */

async function updateLeague(league, sportKey, apiKey) {
  console.log(`\n=== Syncing ${league} (${sportKey}) ===`);

  const events = await fetchOdds(apiKey, sportKey);

  let updated = 0;
  let skippedNoLines = 0;
  let skippedNoTeams = 0;
  let noMatch = 0;

  for (const ev of events) {
    const lines = extractLinesFromEvent(ev);
    if (!lines) {
      skippedNoLines++;
      continue;
    }

    const home = mapTeam(league, ev.home_team);
    const away = mapTeam(league, ev.away_team);

    if (!home || !away) {
      skippedNoTeams++;
      console.log("Team map missing:", league, ev.home_team, ev.away_team);
      continue;
    }

    let snapshot = await db
      .collection("games")
      .where("league", "==", league)
      .where("oddsEventId", "==", ev.id)
      .limit(1)
      .get();

    if (snapshot.empty) {
      snapshot = await db
        .collection("games")
        .where("league", "==", league)
        .where("homeTeam", "==", home)
        .where("awayTeam", "==", away)
        .limit(1)
        .get();
    }

    if (snapshot.empty) {
      noMatch++;
      console.log("No match:", league, home, away, "| oddsEventId:", ev.id);
      continue;
    }

    const docRef = snapshot.docs[0].ref;

    await docRef.set(
      {
        oddsEventId: ev.id,
        markets: {
          ...(lines.spreadHome !== null || lines.spreadAway !== null
            ? {
                spread: {
                  homeLine: lines.spreadHome,
                  awayLine: lines.spreadAway,
                },
              }
            : {}),
          ...(lines.total !== null
            ? {
                total: {
                  line: lines.total,
                },
              }
            : {}),
          ...(lines.moneylineHome !== null || lines.moneylineAway !== null
            ? {
                moneyline: {
                  home: lines.moneylineHome,
                  away: lines.moneylineAway,
                },
              }
            : {}),
        },
        source: "oddsapi",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    updated++;
    console.log(
      "Updated:",
      league,
      away,
      "@",
      home,
      "| ML:",
      lines.moneylineAway,
      lines.moneylineHome,
      "| SP:",
      lines.spreadAway,
      lines.spreadHome,
      "| OU:",
      lines.total,
    );
  }

  console.log(
    `=== ${league} done | updated=${updated} noMatch=${noMatch} noLines=${skippedNoLines} noTeams=${skippedNoTeams} ===`,
  );
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

run().catch((err) => {
  console.error("odds-sync-firestore failed:", err?.response?.data || err);
  process.exit(1);
});
