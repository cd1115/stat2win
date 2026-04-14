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

// ── CRITICAL: Must match getWeekId() in Cloud Functions (Sunday-based) ──────
function getWeekId(date = new Date()) {
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const weekStartSunday = (d) => {
    const x = startOfDay(d);
    x.setDate(x.getDate() - x.getDay()); // Sunday = 0
    return x;
  };
  const start = weekStartSunday(date);
  const year = start.getFullYear();
  const jan1 = startOfDay(new Date(year, 0, 1));
  const firstSunday = weekStartSunday(jan1);
  const diffDays = Math.floor((start - firstSunday) / 86400000);
  const weekNo = Math.floor(diffDays / 7) + 1;
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
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

function abbr(name) {
  return NBA_TEAM_MAP[name] ?? null;
}

async function findExisting(oddsEventId, matchKey) {
  // 1) by oddsEventId
  let q = await db
    .collection("games")
    .where("sport", "==", "NBA")
    .where("oddsEventId", "==", oddsEventId)
    .limit(1)
    .get();
  if (!q.empty) return q.docs[0];

  // 2) by gameId (oddsEventId is used as gameId in Cloud Functions)
  q = await db
    .collection("games")
    .where("sport", "==", "NBA")
    .where("gameId", "==", oddsEventId)
    .limit(1)
    .get();
  if (!q.empty) return q.docs[0];

  // 3) by matchKey
  q = await db
    .collection("games")
    .where("sport", "==", "NBA")
    .where("matchKey", "==", matchKey)
    .limit(1)
    .get();
  if (!q.empty) return q.docs[0];

  return null;
}

async function run() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.error("Missing ODDS_API_KEY");
    process.exit(1);
  }

  const { data } = await axios.get(
    "https://api.the-odds-api.com/v4/sports/basketball_nba/events",
    { params: { apiKey, dateFormat: "iso" }, timeout: 20000 },
  );

  console.log(`[nba-events] received ${data.length} event(s)`);
  let upserted = 0,
    skipped = 0,
    migrated = 0;

  for (const ev of data) {
    const home = abbr(ev.home_team);
    const away = abbr(ev.away_team);
    if (!home || !away) {
      console.log("TEAM MAP missing:", ev.home_team, ev.away_team);
      skipped++;
      continue;
    }

    const commence = new Date(ev.commence_time);
    if (isNaN(commence.getTime())) {
      skipped++;
      continue;
    }

    const oddsEventId = String(ev.id ?? "").trim();
    if (!oddsEventId) {
      skipped++;
      continue;
    }

    const weekId = getWeekId(commence);
    const dateKey = ev.commence_time.slice(0, 10).replace(/-/g, "");
    const matchKey = `NBA_${dateKey}_${home}_${away}`;

    // ── CRITICAL FIX: gameId = oddsEventId (pure), matching Cloud Functions ──
    // OLD code used `${yyyymmdd}_${ev.id}`.slice(0, 25) — WRONG, caused mismatches
    const gameId = oddsEventId;
    const docId = `NBA_${weekId}_${gameId}`;

    const existing = await findExisting(oddsEventId, matchKey);
    const targetRef = existing?.ref ?? db.collection("games").doc(docId);

    if (existing && existing.id !== docId) {
      migrated++;
      console.log(`  [migrate] ${existing.id} → ${docId}`);
    }

    const existingData = existing?.exists ? existing.data() : null;
    const existingStatus = String(existingData?.status ?? "").toLowerCase();

    await targetRef.set(
      {
        league: "NBA",
        sport: "NBA",
        weekId,
        gameId,
        matchKey,
        oddsEventId,
        homeTeam: home,
        awayTeam: away,
        startTime: admin.firestore.Timestamp.fromDate(commence),
        // Preserve status/scores if already set by scores sync
        status:
          existingStatus === "inprogress" || existingStatus === "final"
            ? existingStatus
            : "scheduled",
        scoreHome:
          typeof existingData?.scoreHome === "number"
            ? existingData.scoreHome
            : null,
        scoreAway:
          typeof existingData?.scoreAway === "number"
            ? existingData.scoreAway
            : null,
        source: "oddsapi",
        createdAt:
          existingData?.createdAt ??
          admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    upserted++;
  }

  console.log(
    `[nba-events] done | upserted=${upserted} skipped=${skipped} migrated=${migrated}`,
  );
}

run().catch((e) => {
  console.error(
    "nba-events-sync failed:",
    e?.response?.data || e?.message || e,
  );
  process.exit(1);
});
