import axios from "axios";
import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(
  fs.readFileSync(new URL("./serviceAccountKey.json", import.meta.url), "utf8"),
);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// Priority bookmakers — falls back when DraftKings doesn't have lines yet
const BOOKMAKER_PRIORITY = [
  "draftkings",
  "fanduel",
  "betmgm",
  "williamhill_us",
  "bovada",
  "betonlineag",
];

// Find best market across all bookmakers independently
function findBestMarket(ev, marketKey) {
  for (const bookKey of BOOKMAKER_PRIORITY) {
    const bk = (ev.bookmakers || []).find((b) => b.key === bookKey);
    if (!bk) continue;
    const market = (bk.markets || []).find((m) => m.key === marketKey);
    if (market?.outcomes?.length) return market;
  }
  return null;
}

function extractLines(ev) {
  const spreadsMarket = findBestMarket(ev, "spreads");
  const totalsMarket = findBestMarket(ev, "totals");
  const h2hMarket = findBestMarket(ev, "h2h");

  let spreadHome = null,
    spreadAway = null;
  if (spreadsMarket?.outcomes?.length) {
    const home = spreadsMarket.outcomes.find((o) => o.name === ev.home_team);
    const away = spreadsMarket.outcomes.find((o) => o.name === ev.away_team);
    spreadHome = typeof home?.point === "number" ? home.point : null;
    spreadAway = typeof away?.point === "number" ? away.point : null;
    if (spreadHome !== null && spreadAway === null) spreadAway = -spreadHome;
    if (spreadAway !== null && spreadHome === null) spreadHome = -spreadAway;
  }

  let total = null;
  if (totalsMarket?.outcomes?.length) {
    const over = totalsMarket.outcomes.find(
      (o) => String(o.name).toLowerCase() === "over",
    );
    total = typeof over?.point === "number" ? over.point : null;
    if (total === null) {
      const any = totalsMarket.outcomes.find(
        (o) => typeof o.point === "number",
      );
      total = any?.point ?? null;
    }
  }

  let moneylineHome = null,
    moneylineAway = null;
  if (h2hMarket?.outcomes?.length) {
    const home = h2hMarket.outcomes.find((o) => o.name === ev.home_team);
    const away = h2hMarket.outcomes.find((o) => o.name === ev.away_team);
    moneylineHome = typeof home?.price === "number" ? home.price : null;
    moneylineAway = typeof away?.price === "number" ? away.price : null;
  }

  if (
    spreadHome === null &&
    spreadAway === null &&
    total === null &&
    moneylineHome === null &&
    moneylineAway === null
  )
    return null;

  return { spreadHome, spreadAway, total, moneylineHome, moneylineAway };
}

async function findGame(sportKey, ev) {
  const sport = sportKey === "basketball_nba" ? "NBA" : "MLB";
  const oddsEventId = String(ev.id ?? "").trim();
  const commence = new Date(ev.commence_time);
  const dateKey = `${commence.getFullYear()}${String(commence.getMonth() + 1).padStart(2, "0")}${String(commence.getDate()).padStart(2, "0")}`;

  // 1) by oddsEventId (most reliable)
  let q = await db
    .collection("games")
    .where("sport", "==", sport)
    .where("oddsEventId", "==", oddsEventId)
    .limit(1)
    .get();
  if (!q.empty) return q.docs[0];

  // 2) by gameId = oddsEventId (Cloud Functions format)
  q = await db
    .collection("games")
    .where("sport", "==", sport)
    .where("gameId", "==", oddsEventId)
    .limit(1)
    .get();
  if (!q.empty) return q.docs[0];

  // 3) by matchKey
  const matchKey = `${sport}_${dateKey}_${ev._home}_${ev._away}`;
  q = await db
    .collection("games")
    .where("matchKey", "==", matchKey)
    .limit(1)
    .get();
  if (!q.empty) return q.docs[0];

  // 4) team + time window
  q = await db
    .collection("games")
    .where("sport", "==", sport)
    .where("homeTeam", "==", ev._home)
    .where("awayTeam", "==", ev._away)
    .limit(10)
    .get();

  if (!q.empty) {
    const candidates = q.docs.filter((doc) => {
      const gs = doc.data()?.startTime?.toDate?.() ?? null;
      return (
        gs && Math.abs(gs.getTime() - commence.getTime()) <= 36 * 3600 * 1000
      );
    });
    if (candidates.length) return candidates[0];
  }

  return null;
}

async function syncOdds(sportKey, teamMap) {
  const apiKey = process.env.ODDS_API_KEY;
  const { data, headers } = await axios.get(
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds`,
    {
      params: {
        apiKey,
        bookmakers: BOOKMAKER_PRIORITY.join(","),
        markets: "h2h,spreads,totals",
        oddsFormat: "american",
        dateFormat: "iso",
      },
      timeout: 20000,
    },
  );

  const remaining =
    headers["x-requests-remaining"] ?? headers["X-Requests-Remaining"];
  const used = headers["x-requests-used"] ?? headers["X-Requests-Used"];
  console.log(
    `[${sportKey}] used=${used ?? "?"} remaining=${remaining ?? "?"} events=${data.length}`,
  );

  let updated = 0,
    skipped = 0,
    noMatch = 0;

  for (const ev of data) {
    const home = teamMap[ev.home_team] ?? null;
    const away = teamMap[ev.away_team] ?? null;
    if (!home || !away) {
      skipped++;
      continue;
    }

    ev._home = home;
    ev._away = away;

    const lines = extractLines(ev);
    if (!lines) {
      skipped++;
      continue;
    }

    const doc = await findGame(sportKey, ev);
    if (!doc) {
      noMatch++;
      console.log(`  [no-match] ${away} @ ${home}`);
      continue;
    }

    const game = doc.data();
    if (String(game?.status ?? "").toLowerCase() === "final") {
      skipped++;
      continue;
    }

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

    await doc.ref.set(
      {
        oddsEventId: String(ev.id),
        markets,
        source: "oddsapi",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    updated++;
    console.log(
      `  [ok] ${away} @ ${home} | ML:${lines.moneylineAway}/${lines.moneylineHome} SP:${lines.spreadAway}/${lines.spreadHome} OU:${lines.total}`,
    );
  }

  console.log(
    `[${sportKey}] done | updated=${updated} skipped=${skipped} noMatch=${noMatch}`,
  );
}

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
  "LA Angels": "LAA",
  "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",
  "Minnesota Twins": "MIN",
  "New York Mets": "NYM",
  "New York Yankees": "NYY",
  Athletics: "OAK",
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

async function run() {
  if (!process.env.ODDS_API_KEY) {
    console.error("Missing ODDS_API_KEY");
    process.exit(1);
  }
  console.log("=== Syncing odds (NBA + MLB) ===");
  await syncOdds("basketball_nba", NBA_TEAM_MAP);
  await syncOdds("baseball_mlb", MLB_TEAM_MAP);
  console.log("=== DONE ===");
}

run().catch((e) => {
  console.error("odds-sync failed:", e?.response?.data || e?.message || e);
  process.exit(1);
});
