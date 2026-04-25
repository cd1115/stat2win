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

/**
 * Priority order for bookmakers.
 * We try each in order and take the FIRST one that has the data we need.
 * This way if DraftKings doesn't have spread/total yet, we fall back to FanDuel, etc.
 */
const BOOKMAKER_PRIORITY = [
  "draftkings",
  "fanduel",
  "betmgm",
  "williamhill_us",
  "bovada",
  "betonlineag",
  "mybookieag",
];

/**
 * Find the best bookmaker for a specific market key.
 * Returns the market object from the first bookmaker that has it with valid data.
 */
function findBestMarket(ev, marketKey) {
  for (const bookKey of BOOKMAKER_PRIORITY) {
    const bk = (ev.bookmakers || []).find((b) => b.key === bookKey);
    if (!bk) continue;
    const market = (bk.markets || []).find((m) => m.key === marketKey);
    if (market?.outcomes?.length) return market;
  }
  return null;
}

function extractLinesFromEvent(ev) {
  // ── Spread ──
  // Use best available bookmaker per market independently
  const spreadsMarket = findBestMarket(ev, "spreads");
  const totalsMarket = findBestMarket(ev, "totals");
  const h2hMarket = findBestMarket(ev, "h2h");

  let spreadHome = null;
  let spreadAway = null;
  if (spreadsMarket?.outcomes?.length) {
    const home = spreadsMarket.outcomes.find((o) => o.name === ev.home_team);
    const away = spreadsMarket.outcomes.find((o) => o.name === ev.away_team);
    spreadHome = typeof home?.point === "number" ? home.point : null;
    spreadAway = typeof away?.point === "number" ? away.point : null;

    // Derive missing side (they're always mirrors: -1.5 / +1.5)
    if (spreadHome !== null && spreadAway === null) spreadAway = -spreadHome;
    if (spreadAway !== null && spreadHome === null) spreadHome = -spreadAway;
  }

  let total = null;
  if (totalsMarket?.outcomes?.length) {
    const over = totalsMarket.outcomes.find(
      (o) => String(o.name).toLowerCase() === "over",
    );
    total = typeof over?.point === "number" ? over.point : null;

    // Fallback: take any outcome with a point
    if (total === null) {
      const any = totalsMarket.outcomes.find(
        (o) => typeof o.point === "number",
      );
      total = any?.point ?? null;
    }
  }

  let moneylineHome = null;
  let moneylineAway = null;
  if (h2hMarket?.outcomes?.length) {
    const home = h2hMarket.outcomes.find((o) => o.name === ev.home_team);
    const away = h2hMarket.outcomes.find((o) => o.name === ev.away_team);
    moneylineHome = typeof home?.price === "number" ? home.price : null;
    moneylineAway = typeof away?.price === "number" ? away.price : null;
  }

  // Only skip entirely if we have NOTHING at all
  if (
    spreadHome === null &&
    spreadAway === null &&
    total === null &&
    moneylineHome === null &&
    moneylineAway === null
  ) {
    return null;
  }

  return { spreadHome, spreadAway, total, moneylineHome, moneylineAway };
}

/* ================= FETCH ODDS ================= */

async function fetchOdds(apiKey, sportKey) {
  const res = await axios.get(
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds`,
    {
      params: {
        apiKey,
        // Fetch multiple bookmakers so we can fall back when DK is missing lines
        bookmakers: BOOKMAKER_PRIORITY.join(","),
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
    `[fetchOdds] ${sportKey} | events=${res.data.length} | used=${used ?? "?"} remaining=${remaining ?? "?"}`,
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
      console.log(`  [skip-nolines] ${ev.away_team} @ ${ev.home_team}`);
      continue;
    }

    const home = mapTeam(league, ev.home_team);
    const away = mapTeam(league, ev.away_team);

    if (!home || !away) {
      skippedNoTeams++;
      console.log(
        "  [skip-nomap] Team map missing:",
        league,
        ev.home_team,
        ev.away_team,
      );
      continue;
    }

    // ── Step 1: match by exact oddsEventId ──
    let snapshot = await db
      .collection("games")
      .where("league", "==", league)
      .where("oddsEventId", "==", ev.id)
      .limit(1)
      .get();

    // ── Step 2: fallback — sport field instead of league (some docs use sport:"MLB") ──
    if (snapshot.empty) {
      snapshot = await db
        .collection("games")
        .where("sport", "==", league)
        .where("oddsEventId", "==", ev.id)
        .limit(1)
        .get();
    }

    // ── Step 3: fallback — oddsEventId might have been saved with extra suffix (corrupted).
    //    Match by team abbreviations + same calendar date instead.
    if (snapshot.empty) {
      // Build a date window: midnight-to-midnight on the game's commence date (UTC)
      const gameDate = new Date(ev.commence_time);
      const dayStart = new Date(
        Date.UTC(
          gameDate.getUTCFullYear(),
          gameDate.getUTCMonth(),
          gameDate.getUTCDate(),
        ),
      );
      const dayEnd = new Date(
        Date.UTC(
          gameDate.getUTCFullYear(),
          gameDate.getUTCMonth(),
          gameDate.getUTCDate() + 1,
        ),
      );

      // Try with league field
      snapshot = await db
        .collection("games")
        .where("league", "==", league)
        .where("homeTeam", "==", home)
        .where("awayTeam", "==", away)
        .where("startTime", ">=", dayStart)
        .where("startTime", "<", dayEnd)
        .limit(1)
        .get();
    }

    // ── Step 4: same but using sport field ──
    if (snapshot.empty) {
      const gameDate = new Date(ev.commence_time);
      const dayStart = new Date(
        Date.UTC(
          gameDate.getUTCFullYear(),
          gameDate.getUTCMonth(),
          gameDate.getUTCDate(),
        ),
      );
      const dayEnd = new Date(
        Date.UTC(
          gameDate.getUTCFullYear(),
          gameDate.getUTCMonth(),
          gameDate.getUTCDate() + 1,
        ),
      );

      snapshot = await db
        .collection("games")
        .where("sport", "==", league)
        .where("homeTeam", "==", home)
        .where("awayTeam", "==", away)
        .where("startTime", ">=", dayStart)
        .where("startTime", "<", dayEnd)
        .limit(1)
        .get();
    }

    // ── Step 5: last resort — match by matchKey pattern (MLB_YYYYMMDD_HOME_AWAY) ──
    if (snapshot.empty) {
      const gameDate = new Date(ev.commence_time);
      const yyyymmdd = `${gameDate.getUTCFullYear()}${String(gameDate.getUTCMonth() + 1).padStart(2, "0")}${String(gameDate.getUTCDate()).padStart(2, "0")}`;
      const matchKey = `${league}_${yyyymmdd}_${home}_${away}`;

      snapshot = await db
        .collection("games")
        .where("matchKey", "==", matchKey)
        .limit(1)
        .get();
    }

    if (snapshot.empty) {
      noMatch++;
      console.log(
        `  [no-match] ${league} ${away} @ ${home} | oddsEventId: ${ev.id}`,
      );
      continue;
    }

    // If the stored oddsEventId is different (corrupted/old), log it so we can track
    const existingOddsId = snapshot.docs[0].data()?.oddsEventId;
    if (existingOddsId && existingOddsId !== ev.id) {
      console.log(
        `  [fix-id] ${league} ${away} @ ${home} | replacing corrupted oddsEventId: ${existingOddsId} → ${ev.id}`,
      );
    }

    const docRef = snapshot.docs[0].ref;

    // Build the markets payload — only include markets that have data
    // This prevents overwriting existing good data with nulls
    const markets = {};

    if (lines.spreadHome !== null || lines.spreadAway !== null) {
      markets.spread = {
        homeLine: lines.spreadHome,
        awayLine: lines.spreadAway,
      };
    }

    if (lines.total !== null) {
      markets.total = { line: lines.total };
    }

    if (lines.moneylineHome !== null || lines.moneylineAway !== null) {
      markets.moneyline = {
        home: lines.moneylineHome,
        away: lines.moneylineAway,
      };
    }

    await docRef.set(
      {
        oddsEventId: ev.id,
        markets,
        source: "oddsapi",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    updated++;
    console.log(
      `  [ok] ${league} ${away} @ ${home}`,
      `| ML: ${lines.moneylineAway ?? "—"}/${lines.moneylineHome ?? "—"}`,
      `| SP: ${lines.spreadAway ?? "—"}/${lines.spreadHome ?? "—"}`,
      `| OU: ${lines.total ?? "—"}`,
    );
  }

  console.log(
    `=== ${league} done | updated=${updated} noMatch=${noMatch} noLines=${skippedNoLines} noTeams=${skippedNoTeams} ===\n`,
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
