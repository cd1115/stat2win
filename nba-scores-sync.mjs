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

async function run() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.error("Missing ODDS_API_KEY");
    process.exit(1);
  }

  const url = "https://api.the-odds-api.com/v4/sports/basketball_nba/scores";

  // daysFrom: 1 = hoy/ayer (si quieres backfill pon 3, 7, etc.)
  const { data } = await axios.get(url, {
    params: { apiKey, daysFrom: 1, dateFormat: "iso" },
    timeout: 20000,
  });

  let updated = 0;
  let skipped = 0;

  for (const g of data) {
    if (!g.completed) continue;

    const home = abbr(g.home_team);
    const away = abbr(g.away_team);

    if (!home || !away) {
      console.log("TEAM MAP missing:", g.home_team, "vs", g.away_team);
      skipped++;
      continue;
    }

    const dateKey = String(g.commence_time).slice(0, 10).replaceAll("-", "");
    const matchKey = `NBA_${dateKey}_${home}_${away}`;

    const snap = await db
      .collection("games")
      .where("matchKey", "==", matchKey)
      .limit(1)
      .get();

    /** @type {import("firebase-admin/firestore").DocumentReference} */
    let ref;

    if (snap.empty) {
      // Crear el game si no existe
      ref = db.collection("games").doc(matchKey);

      await ref.set(
        {
          league: "NBA",
          sport: "NBA",
          weekId: "AUTO",
          gameId: matchKey,
          matchKey,
          homeTeam: home,
          awayTeam: away,
          startTime: admin.firestore.Timestamp.fromDate(
            new Date(g.commence_time),
          ),
          status: "final",
          source: "oddsapi",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      console.log("Created missing game:", matchKey);
    } else {
      ref = snap.docs[0].ref;
    }

    const homeScoreRaw =
      g.scores?.find((s) => s.name === g.home_team)?.score ?? null;
    const awayScoreRaw =
      g.scores?.find((s) => s.name === g.away_team)?.score ?? null;

    const homeScore = homeScoreRaw != null ? Number(homeScoreRaw) : null;
    const awayScore = awayScoreRaw != null ? Number(awayScoreRaw) : null;

    await ref.set(
      {
        scoreHome: homeScore,
        scoreAway: awayScore,
        status: "final",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    console.log("FINAL updated:", matchKey, homeScore, awayScore);
    updated++;
  }

  console.log("Scores updated:", updated, "Skipped:", skipped);
  console.log("DONE");
}

run().catch((e) => {
  console.error("NBA scores sync error:", e?.response?.status, e?.message || e);
  process.exit(1);
});
