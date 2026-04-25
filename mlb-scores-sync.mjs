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
  "Oakland Athletics": "OAK", // ← both names the API uses
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

function getWeekId(date = new Date()) {
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const weekStartSunday = (d) => {
    const x = startOfDay(d);
    x.setDate(x.getDate() - x.getDay());
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

async function findGame(home, away, startAt, oddsEventId) {
  const dateKey = `${startAt.getFullYear()}${String(startAt.getMonth() + 1).padStart(2, "0")}${String(startAt.getDate()).padStart(2, "0")}`;
  const matchKey = `MLB_${dateKey}_${home}_${away}`;

  // 1) by matchKey
  let q = await db
    .collection("games")
    .where("matchKey", "==", matchKey)
    .limit(1)
    .get();
  if (!q.empty) return q.docs[0];

  // 2) by oddsEventId
  if (oddsEventId) {
    q = await db
      .collection("games")
      .where("sport", "==", "MLB")
      .where("oddsEventId", "==", oddsEventId)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];

    // also as gameId (Cloud Functions format: oddsEventId pure)
    q = await db
      .collection("games")
      .where("sport", "==", "MLB")
      .where("gameId", "==", oddsEventId)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];
  }

  // 3) team + time window fallback
  q = await db
    .collection("games")
    .where("sport", "==", "MLB")
    .where("homeTeam", "==", home)
    .where("awayTeam", "==", away)
    .limit(10)
    .get();

  if (!q.empty) {
    const candidates = q.docs.filter((doc) => {
      const gs = doc.data()?.startTime?.toDate?.() ?? null;
      return (
        gs && Math.abs(gs.getTime() - startAt.getTime()) <= 36 * 3600 * 1000
      );
    });
    if (candidates.length) {
      candidates.sort((a, b) => {
        const at = a.data()?.startTime?.toDate?.()?.getTime?.() ?? 0;
        const bt = b.data()?.startTime?.toDate?.()?.getTime?.() ?? 0;
        return (
          Math.abs(at - startAt.getTime()) - Math.abs(bt - startAt.getTime())
        );
      });
      return candidates[0];
    }
  }

  return null;
}

async function run() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.error("Missing ODDS_API_KEY");
    process.exit(1);
  }

  // Use Odds API scores endpoint — covers today + 2 days back
  const { data, headers } = await axios.get(
    "https://api.the-odds-api.com/v4/sports/baseball_mlb/scores",
    { params: { apiKey, daysFrom: 3, dateFormat: "iso" }, timeout: 20000 },
  );

  const remaining =
    headers["x-requests-remaining"] ?? headers["X-Requests-Remaining"];
  const used = headers["x-requests-used"] ?? headers["X-Requests-Used"];
  console.log(
    `[mlb-scores] used=${used ?? "?"} remaining=${remaining ?? "?"} games=${data.length}`,
  );

  let updated = 0,
    skipped = 0,
    notFound = 0;

  for (const g of data) {
    const home = mapMLBTeam(g.home_team);
    const away = mapMLBTeam(g.away_team);
    if (!home || !away) {
      console.log("TEAM MAP missing:", g.home_team, g.away_team);
      skipped++;
      continue;
    }

    const startAt = new Date(g.commence_time);
    if (isNaN(startAt.getTime())) {
      skipped++;
      continue;
    }

    const status = g.completed
      ? "final"
      : g.scores && g.scores.length > 0
        ? "inprogress"
        : "scheduled";

    const homeScoreRaw =
      g.scores?.find((s) => s.name === g.home_team)?.score ?? null;
    const awayScoreRaw =
      g.scores?.find((s) => s.name === g.away_team)?.score ?? null;
    const homeScore = homeScoreRaw != null ? Number(homeScoreRaw) : null;
    const awayScore = awayScoreRaw != null ? Number(awayScoreRaw) : null;

    const doc = await findGame(home, away, startAt, g.id);

    if (!doc) {
      // Auto-create for completed games only
      if (g.completed) {
        const weekId = getWeekId(startAt);
        const docRef = db.collection("games").doc(`MLB_${weekId}_${g.id}`);
        await docRef.set(
          {
            league: "MLB",
            sport: "MLB",
            weekId,
            gameId: g.id,
            oddsEventId: g.id,
            homeTeam: home,
            awayTeam: away,
            startTime: admin.firestore.Timestamp.fromDate(startAt),
            status: "final",
            scoreHome: homeScore,
            scoreAway: awayScore,
            source: "oddsapi-scores",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        console.log(`  [auto-created] ${away} @ ${home} (final)`);
        updated++;
      } else {
        notFound++;
      }
      continue;
    }

    const existingStatus = String(doc.data()?.status ?? "").toLowerCase();
    // Never downgrade from final
    if (existingStatus === "final" && status !== "final") {
      skipped++;
      continue;
    }

    await doc.ref.set(
      {
        status,
        scoreHome: homeScore,
        scoreAway: awayScore,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    console.log(`  [${status}] ${away} @ ${home} | ${awayScore}-${homeScore}`);
    updated++;
  }

  console.log(
    `[mlb-scores] done | updated=${updated} skipped=${skipped} notFound=${notFound}`,
  );
}

run().catch((err) => {
  console.error(
    "mlb-scores-sync failed:",
    err?.response?.data || err?.message || err,
  );
  process.exit(1);
});
