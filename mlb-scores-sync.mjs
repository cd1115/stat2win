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

function mapMLBTeam(name) {
  return MLB_TEAM_MAP[name] ?? null;
}

function toDateOrNull(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getWeekIdFromDate(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function buildGameDocId({ league, weekId, eventDate, eventId }) {
  const ymd = `${eventDate.getFullYear()}${String(eventDate.getMonth() + 1).padStart(2, "0")}${String(eventDate.getDate()).padStart(2, "0")}`;
  return `${league}_${weekId}_${ymd}_${eventId}`;
}

async function fetchMLBEvents(apiKey) {
  const res = await axios.get(
    "https://api.the-odds-api.com/v4/sports/baseball_mlb/events",
    {
      params: {
        apiKey,
        dateFormat: "iso",
      },
      timeout: 20000,
    },
  );

  const remaining =
    res.headers["x-requests-remaining"] ?? res.headers["X-Requests-Remaining"];
  const used = res.headers["x-requests-used"] ?? res.headers["X-Requests-Used"];

  console.log(`[mlb-events] used=${used ?? "?"} remaining=${remaining ?? "?"}`);

  return res.data;
}

async function upsertMLBGame(ev) {
  const homeTeam = mapMLBTeam(ev.home_team);
  const awayTeam = mapMLBTeam(ev.away_team);

  if (!homeTeam || !awayTeam) {
    console.log(
      "Skipping unmapped MLB teams:",
      ev.away_team,
      "@",
      ev.home_team,
    );
    return;
  }

  const startDate = toDateOrNull(ev.commence_time);
  if (!startDate) {
    console.log("Skipping invalid MLB start time:", ev.id, ev.commence_time);
    return;
  }

  const weekId = getWeekIdFromDate(startDate);
  const league = "MLB";
  const eventId = String(ev.id || "").trim();

  if (!eventId) {
    console.log("Skipping MLB event with missing id:", ev);
    return;
  }

  const gameId = `${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, "0")}${String(startDate.getDate()).padStart(2, "0")}_${eventId}`;
  const matchKey = `${league}_${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, "0")}${String(startDate.getDate()).padStart(2, "0")}_${homeTeam}_${awayTeam}`;
  const docId = buildGameDocId({
    league,
    weekId,
    eventDate: startDate,
    eventId,
  });

  const docRef = db.collection("games").doc(docId);
  const existing = await docRef.get();

  const payload = {
    league,
    sport: "MLB",
    weekId,
    gameId,
    matchKey,
    oddsEventId: eventId,
    homeTeam,
    awayTeam,
    startTime: admin.firestore.Timestamp.fromDate(startDate),
    status: "scheduled",
    scoreHome: existing.exists ? (existing.data()?.scoreHome ?? null) : null,
    scoreAway: existing.exists ? (existing.data()?.scoreAway ?? null) : null,
    source: "oddsapi",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(existing.exists
      ? {}
      : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
  };

  await docRef.set(payload, { merge: true });

  console.log(`Upserted MLB game: ${awayTeam} @ ${homeTeam} | ${docId}`);
}

async function run() {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    console.error("Missing ODDS_API_KEY");
    process.exit(1);
  }

  console.log("=== Syncing MLB events (baseball_mlb) ===");
  const events = await fetchMLBEvents(apiKey);

  console.log(`[mlb-events] received ${events.length} event(s)`);

  for (const ev of events) {
    await upsertMLBGame(ev);
  }

  console.log("MLB sync done");
}

run().catch((err) => {
  console.error("mlb-scores-sync failed:", err?.response?.data || err);
  process.exit(1);
});
