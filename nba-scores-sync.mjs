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

// Find game by matchKey OR by team abbreviations + time window
async function findGame(home, away, startAt, oddsEventId) {
  const dateKey = startAt.toISOString().slice(0, 10).replace(/-/g, "");
  const matchKey = `NBA_${dateKey}_${home}_${away}`;

  // 1) by matchKey (fastest)
  let q = await db
    .collection("games")
    .where("matchKey", "==", matchKey)
    .limit(1)
    .get();
  if (!q.empty) return q.docs[0];

  // 2) by oddsEventId (reliable for new format)
  if (oddsEventId) {
    q = await db
      .collection("games")
      .where("sport", "==", "NBA")
      .where("oddsEventId", "==", oddsEventId)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];

    // also as gameId
    q = await db
      .collection("games")
      .where("sport", "==", "NBA")
      .where("gameId", "==", oddsEventId)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];
  }

  // 3) by homeTeam + awayTeam within 36h window
  q = await db
    .collection("games")
    .where("sport", "==", "NBA")
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

  // daysFrom=3 covers today + 2 days back so we catch games that ended yesterday
  const { data } = await axios.get(
    "https://api.the-odds-api.com/v4/sports/basketball_nba/scores",
    { params: { apiKey, daysFrom: 3, dateFormat: "iso" }, timeout: 20000 },
  );

  console.log(`[nba-scores] received ${data.length} game(s)`);
  let updated = 0,
    skipped = 0,
    notFound = 0;

  for (const g of data) {
    const home = abbr(g.home_team);
    const away = abbr(g.away_team);
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

    // ── Status from Odds API scores endpoint ──
    // g.completed = true → final
    // g.completed = false + scores exist → inprogress
    // g.completed = false + no scores → scheduled
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
      // Game not in Firestore yet — create it so picks can resolve
      if (g.completed) {
        const docRef = db.collection("games").doc(`NBA_AUTO_${g.id}`);
        await docRef.set(
          {
            league: "NBA",
            sport: "NBA",
            weekId: "AUTO",
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

    const existing = doc.data();
    const existingStatus = String(existing?.status ?? "").toLowerCase();

    // Don't downgrade status: final stays final
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
    `[nba-scores] done | updated=${updated} skipped=${skipped} notFound=${notFound}`,
  );
}

run().catch((e) => {
  console.error(
    "nba-scores-sync failed:",
    e?.response?.data || e?.message || e,
  );
  process.exit(1);
});
