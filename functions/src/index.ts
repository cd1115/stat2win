/* functions/src/index.ts */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import axios from "axios";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();

type Sport = "NBA" | "MLB";
type Market = "moneyline" | "spread" | "total" | "ou";
type PickResult = "pending" | "win" | "loss" | "push";
type PickSelection = "home" | "away" | "over" | "under";

export const placePick = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const sportRaw = String(
    req.data?.sport ?? req.data?.league ?? "NBA",
  ).toUpperCase();
  if (sportRaw !== "NBA" && sportRaw !== "MLB") {
    throw new HttpsError("invalid-argument", "Unsupported sport.");
  }
  const sport = sportRaw as Sport;

  const weekId = String(req.data?.weekId ?? "").trim();
  if (!weekId) throw new HttpsError("invalid-argument", "weekId is required.");

  // market: moneyline | spread | ou | total
  const marketRaw = String(req.data?.market ?? "").toLowerCase();
  const market: Market =
    marketRaw === "moneyline" ||
    marketRaw === "spread" ||
    marketRaw === "ou" ||
    marketRaw === "total"
      ? (marketRaw as any)
      : null;

  if (!market) throw new HttpsError("invalid-argument", "Invalid market.");

  // selection: home | away | over | under
  const selectionRaw = String(
    req.data?.selection ?? req.data?.pick ?? "",
  ).toLowerCase();
  const selection: PickSelection =
    selectionRaw === "home" ||
    selectionRaw === "away" ||
    selectionRaw === "over" ||
    selectionRaw === "under"
      ? (selectionRaw as any)
      : null;

  if (!selection)
    throw new HttpsError("invalid-argument", "Invalid selection.");

  const clear = req.data?.clear === true;

  // IDs que puede mandar el frontend
  const gameIdIn = String(req.data?.gameId ?? "").trim(); // ideal: game.gameId
  const gameDocIdIn = String(req.data?.gameDocId ?? "").trim(); // opcional: docId "NBA_week_gameId"
  const externalGameId = String(req.data?.externalGameId ?? "").trim(); // matchKey / oddsEventId etc.

  if (!gameIdIn && !gameDocIdIn && !externalGameId) {
    throw new HttpsError("invalid-argument", "gameId is required.");
  }

  // 1) intentamos por docId directo si viene
  let gameSnap: FirebaseFirestore.DocumentSnapshot | null = null;

  const tryDocId = async (docId: string) => {
    if (!docId) return null;
    const snap = await db.collection("games").doc(docId).get();
    return snap.exists ? snap : null;
  };

  // Si el frontend manda docId en gameDocId
  gameSnap = (await tryDocId(gameDocIdIn)) ?? null;

  // Si el frontend mandó gameId pero en realidad es docId (ej: "NBA_2026-W10_20260306_xxx")
  if (!gameSnap && gameIdIn.startsWith("NBA_")) {
    gameSnap = (await tryDocId(gameIdIn)) ?? null;
  }

  // 2) si no, buscamos por campos dentro de games:
  //    sport + weekId + gameId (campo)
  if (!gameSnap && gameIdIn) {
    const q = await db
      .collection("games")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
      .where("gameId", "==", gameIdIn)
      .limit(1)
      .get();

    if (!q.empty) gameSnap = q.docs[0];
  }

  // 3) fallback: matchKey / oddsEventId
  if (!gameSnap && externalGameId) {
    let q = await db
      .collection("games")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
      .where("matchKey", "==", externalGameId)
      .limit(1)
      .get();

    if (!q.empty) gameSnap = q.docs[0];

    if (!gameSnap) {
      q = await db
        .collection("games")
        .where("sport", "==", sport)
        .where("weekId", "==", weekId)
        .where("oddsEventId", "==", externalGameId)
        .limit(1)
        .get();

      if (!q.empty) gameSnap = q.docs[0];
    }
  }

  if (!gameSnap) throw new HttpsError("not-found", "Game not found.");

  const game = gameSnap.data() as any;

  // lock: si ya empezó o está inprogress/final
  const status = String(game?.status ?? "").toLowerCase();
  const startTime: Date | null = game?.startTime?.toDate?.() ?? null;
  const now = new Date();

  if (status === "inprogress" || status === "final") {
    throw new HttpsError(
      "failed-precondition",
      "Picks are locked (game started).",
    );
  }
  if (
    startTime instanceof Date &&
    !Number.isNaN(startTime.getTime()) &&
    startTime <= now
  ) {
    throw new HttpsError("failed-precondition", "Picks are locked (tip-off).");
  }

  // Validaciones por market
  if (
    market === "moneyline" &&
    !(selection === "home" || selection === "away")
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Moneyline selection must be home/away.",
    );
  }
  if (market === "spread" && !(selection === "home" || selection === "away")) {
    throw new HttpsError(
      "invalid-argument",
      "Spread selection must be home/away.",
    );
  }
  if (
    (market === "ou" || market === "total") &&
    !(selection === "over" || selection === "under")
  ) {
    throw new HttpsError(
      "invalid-argument",
      "OU selection must be over/under.",
    );
  }

  const line =
    typeof req.data?.line === "number" && Number.isFinite(req.data.line)
      ? Number(req.data.line)
      : null;

  // ✅ IMPORTANTE: el gameId que guardamos en picks debe ser el campo game.gameId
  // porque tu resolver usa where("gameId"=="game.gameId") :contentReference[oaicite:2]{index=2}
  const gameIdField = String(game?.gameId ?? "").trim();
  if (!gameIdField)
    throw new HttpsError(
      "failed-precondition",
      "Game is missing gameId field.",
    );

  const pickId = `${uid}_${weekId}_${sport}_${gameIdField}_${market}`;
  const pickRef = db.collection("picks").doc(pickId);

  if (clear) {
    await pickRef.delete().catch(() => {});
    return { ok: true, cleared: true, pickId };
  }

  await pickRef.set(
    {
      uid,
      sport,
      league: sport,
      weekId,

      // esto es lo que usa tu UI (pickMap) y tu resolver
      gameId: gameIdField,
      gameDocId: gameSnap.id,

      market,
      selection,
      pick: selection, // por si tu UI lee pick

      line,

      result: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true, pickId };
});

const POINTS_WIN = 100;
const POINTS_LOSS = 0;
const POINTS_PUSH = 50;

/** ===== Auth helpers ===== */
function requireAuth(req: any) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Login required.");
  return req.auth.uid as string;
}

async function requireAdmin(req: any) {
  const uid = requireAuth(req);
  const user = await admin.auth().getUser(uid);
  const isAdmin = (user.customClaims as any)?.admin === true;
  if (!isAdmin) throw new HttpsError("permission-denied", "Admin only.");
  return uid;
}

async function addRewardHistory(
  userId: string,
  type: string,
  amount: number,
  description: string,
  meta: Record<string, any> = {},
) {
  await db.collection("rewardHistory").add({
    userId,
    type,
    amount,
    description,
    ...meta,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * ✅ Sunday-based week id: "YYYY-W##"
 * Semana domingo 00:00 -> próximo domingo 00:00
 */
function getWeekId(date = new Date()) {
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const weekStartSunday = (d: Date) => {
    const x = startOfDay(d);
    const day = x.getDay(); // 0=Sun
    x.setDate(x.getDate() - day);
    return x;
  };

  const start = weekStartSunday(date);
  const year = start.getFullYear();

  const jan1 = startOfDay(new Date(year, 0, 1));
  const firstSunday = weekStartSunday(jan1);

  const diffMs = start.getTime() - firstSunday.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const weekNo = Math.floor(diffDays / 7) + 1;

  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

/** ===== IDs (anti-duplicados) ===== */
function gameDocId(sport: Sport, weekId: string, gameId: string) {
  return `${sport}_${weekId}_${gameId}`;
}

// ✅ ÚNICO formato permitido (esto evita duplicados):
// leaderboards/{weekId}_{sport}   -> 2026-W08_NBA
// leaderboardsEntries/{weekId}_{sport}_{uid}
function leaderboardDocId(weekId: string, sport: string) {
  return `${weekId}_${sport}`;
}
function leaderboardEntryDocId(weekId: string, sport: string, uid: string) {
  return `${weekId}_${sport}_${uid}`;
}

/** ===== Date + parsing helpers ===== */
// =============================
// ODDS API (NBA) - Scheduled Jobs (v2)
// =============================
const ODDS_API_KEY = defineSecret("ODDS_API_KEY");

const NBA_TEAM_MAP: Record<string, string> = {
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

function yyyymmddFromIso(iso: string) {
  return String(iso).slice(0, 10).split("-").join("");
}

function nbaAbbr(name: string) {
  return NBA_TEAM_MAP[name] ?? null;
}

function prNow() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Puerto_Rico",
    }),
  );
}

function inNbaOddsWindow() {
  const now = prNow();
  const hour = now.getHours();
  return hour >= 11 && hour <= 23;
}

function nbaNeutralMatchKeyFromOddsEventId(oddsEventId: string) {
  return `NBA_${String(oddsEventId).trim()}`;
}

function nbaLegacyMatchKeyFromEvent(ev: any, home: string, away: string) {
  const dateKey = yyyymmddFromIso(String(ev?.commence_time ?? ""));
  return dateKey ? `NBA_${dateKey}_${home}_${away}` : "";
}

async function findExistingNbaGameDoc(args: {
  oddsEventId?: string;
  matchKey?: string;
  legacyMatchKey?: string;
}) {
  const oddsEventId = String(args.oddsEventId ?? "").trim();
  const matchKey = String(args.matchKey ?? "").trim();
  const legacyMatchKey = String(args.legacyMatchKey ?? "").trim();

  if (oddsEventId) {
    let q = await db
      .collection("games")
      .where("sport", "==", "NBA")
      .where("oddsEventId", "==", oddsEventId)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];

    q = await db
      .collection("games")
      .where("sport", "==", "NBA")
      .where("gameId", "==", oddsEventId)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];
  }

  if (matchKey) {
    const q = await db
      .collection("games")
      .where("sport", "==", "NBA")
      .where("matchKey", "==", matchKey)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];
  }

  if (legacyMatchKey) {
    const q = await db
      .collection("games")
      .where("sport", "==", "NBA")
      .where("matchKey", "==", legacyMatchKey)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];
  }

  return null;
}

async function runNbaEventsSync() {
  const apiKey = ODDS_API_KEY.value();
  const url = "https://api.the-odds-api.com/v4/sports/basketball_nba/events";

  const { data } = await axios.get(url, {
    params: { apiKey, dateFormat: "iso" },
    timeout: 20000,
  });

  let upserted = 0;
  let skipped = 0;
  let migrated = 0;

  for (const ev of data as Array<any>) {
    const home = nbaAbbr(ev.home_team);
    const away = nbaAbbr(ev.away_team);
    if (!home || !away) {
      skipped++;
      continue;
    }

    const commence = new Date(ev.commence_time);
    if (Number.isNaN(commence.getTime())) {
      skipped++;
      continue;
    }

    const oddsEventId = String(ev.id ?? "").trim();
    if (!oddsEventId) {
      skipped++;
      continue;
    }

    const legacyDateKey = yyyymmddFromIso(ev.commence_time);
    const legacyMatchKey = nbaLegacyMatchKeyFromEvent(ev, home, away);
    const matchKey = nbaNeutralMatchKeyFromOddsEventId(oddsEventId);

    const weekId = getWeekId(commence);
    const gameId = oddsEventId;
    const docId = gameDocId("NBA", weekId, gameId);

    const existing =
      (await findExistingNbaGameDoc({
        oddsEventId,
        matchKey,
        legacyMatchKey,
      })) ?? null;

    const targetRef = existing?.ref ?? db.collection("games").doc(docId);
    if (existing && existing.id !== docId) {
      migrated++;
    }

    const existingData = existing?.exists ? (existing.data() as any) : null;

    await targetRef.set(
      {
        league: "NBA",
        sport: "NBA",
        weekId,
        gameId,
        matchKey,
        legacyMatchKey: legacyMatchKey || null,
        legacyDateKey: legacyDateKey || null,
        oddsEventId,
        homeTeam: home,
        awayTeam: away,
        startTime: admin.firestore.Timestamp.fromDate(commence),

        // 👇 preservar si ya existía
        status: existingData?.status ?? "scheduled",
        scoreHome:
          typeof existingData?.scoreHome === "number"
            ? existingData.scoreHome
            : null,
        scoreAway:
          typeof existingData?.scoreAway === "number"
            ? existingData.scoreAway
            : null,

        source: "oddsapi",
        createdAt: existingData?.createdAt ?? nowTs(),
        updatedAt: nowTs(),
      },
      { merge: true },
    );

    upserted++;
  }

  console.log("[runNbaEventsSync] done", { upserted, skipped, migrated });
  return { upserted, skipped, migrated };
}

async function runNbaOddsSync(opts?: { force?: boolean }) {
  const force = opts?.force === true;

  if (!force && !inNbaOddsWindow()) {
    console.log("[runNbaOddsSync] skipped: outside PR odds window");
    return { updated: 0, skipped: 0, reason: "outside-window" };
  }

  const apiKey = ODDS_API_KEY.value();
  const url = "https://api.the-odds-api.com/v4/sports/basketball_nba/odds";

  const { data } = await axios.get(url, {
    params: {
      apiKey,
      regions: "us",
      markets: "h2h,spreads,totals",
      bookmakers: "draftkings",
      oddsFormat: "american",
      dateFormat: "iso",
    },
    timeout: 20000,
  });

  let updated = 0;
  let skipped = 0;

  const findOutcome = (m: any, name: string) =>
    (m?.outcomes ?? []).find((o: any) => o?.name === name);

  for (const ev of data as Array<any>) {
    const home = nbaAbbr(ev.home_team);
    const away = nbaAbbr(ev.away_team);
    if (!home || !away) {
      skipped++;
      continue;
    }

    const commence = new Date(ev.commence_time);
    if (Number.isNaN(commence.getTime())) {
      skipped++;
      continue;
    }

    const oddsEventId = String(ev.id ?? "").trim();
    if (!oddsEventId) {
      skipped++;
      continue;
    }

    const legacyMatchKey = nbaLegacyMatchKeyFromEvent(ev, home, away);
    const matchKey = nbaNeutralMatchKeyFromOddsEventId(oddsEventId);

    const book = (ev.bookmakers ?? [])[0];
    if (!book) {
      skipped++;
      continue;
    }

    const markets = book.markets ?? [];
    const mH2H = markets.find((m: any) => m.key === "h2h");
    const mSP = markets.find((m: any) => m.key === "spreads");
    const mTOT = markets.find((m: any) => m.key === "totals");

    const homeML = findOutcome(mH2H, ev.home_team)?.price ?? null;
    const awayML = findOutcome(mH2H, ev.away_team)?.price ?? null;

    const homeSP = findOutcome(mSP, ev.home_team);
    const awaySP = findOutcome(mSP, ev.away_team);

    const overTOT = findOutcome(mTOT, "Over");
    const underTOT = findOutcome(mTOT, "Under");

    const payload: any = {
      oddsEventId,
      matchKey,
      legacyMatchKey: legacyMatchKey || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      markets: {
        moneyline:
          homeML != null && awayML != null
            ? { home: homeML, away: awayML }
            : null,
        spread:
          homeSP?.point != null && awaySP?.point != null
            ? {
                homeLine: Number(homeSP.point),
                awayLine: Number(awaySP.point),
                homeOdds: homeSP.price ?? null,
                awayOdds: awaySP.price ?? null,
              }
            : null,
        total:
          overTOT?.point != null && underTOT?.point != null
            ? {
                line: Number(overTOT.point),
                overOdds: overTOT.price ?? null,
                underOdds: underTOT.price ?? null,
              }
            : null,
      },
    };

    const snap = await findExistingNbaGameDoc({
      oddsEventId,
      matchKey,
      legacyMatchKey,
    });

    if (!snap) {
      skipped++;
      continue;
    }

    const game = snap.data() as any;
    const status = String(game?.status ?? "").toLowerCase();

    if (status === "final") {
      skipped++;
      continue;
    }

    await snap.ref.set(payload, { merge: true });
    updated++;
  }

  console.log("[runNbaOddsSync] done", { updated, skipped, force });
  return { updated, skipped };
}

async function runNbaScoresSync() {
  const url =
    "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";

  const { data } = await axios.get(url, {
    timeout: 20000,
    headers: {
      "User-Agent": "Stat2Win/1.0",
      Accept: "application/json",
    },
  });

  const games = data?.scoreboard?.games ?? [];
  let updated = 0;
  let matched = 0;

  for (const g of games) {
    const home = String(g?.homeTeam?.teamTricode ?? "").toUpperCase();
    const away = String(g?.awayTeam?.teamTricode ?? "").toUpperCase();
    if (!home || !away) continue;

    const hs = Number(g?.homeTeam?.score ?? NaN);
    const as = Number(g?.awayTeam?.score ?? NaN);

    const gameStatus = String(g?.gameStatus ?? "");
    const status =
      gameStatus === "3"
        ? "final"
        : gameStatus === "2"
          ? "inprogress"
          : "scheduled";

    const oddsEventId = String(g?.gameEt ?? g?.gameCode ?? "").trim();
    const iso = String(g?.gameTimeUTC ?? "");
    const startAt = iso ? new Date(iso) : null;
    if (!startAt || Number.isNaN(startAt.getTime())) continue;

    let snap =
      (oddsEventId
        ? await findExistingNbaGameDoc({
            oddsEventId,
            matchKey: nbaNeutralMatchKeyFromOddsEventId(oddsEventId),
          })
        : null) ?? null;

    if (!snap) {
      const q = await db
        .collection("games")
        .where("sport", "==", "NBA")
        .where("homeTeam", "==", home)
        .where("awayTeam", "==", away)
        .limit(5)
        .get();

      if (!q.empty) {
        const candidates = q.docs.filter((doc) => {
          const game = doc.data() as any;
          const gameStart = game?.startTime?.toDate?.() ?? null;
          if (
            !(gameStart instanceof Date) ||
            Number.isNaN(gameStart.getTime())
          ) {
            return false;
          }
          const diffMs = Math.abs(gameStart.getTime() - startAt.getTime());
          return diffMs <= 36 * 60 * 60 * 1000;
        });

        if (candidates.length) {
          candidates.sort((a, b) => {
            const aStart =
              (a.data() as any)?.startTime?.toDate?.()?.getTime?.() ?? 0;
            const bStart =
              (b.data() as any)?.startTime?.toDate?.()?.getTime?.() ?? 0;
            return (
              Math.abs(aStart - startAt.getTime()) -
              Math.abs(bStart - startAt.getTime())
            );
          });
          snap = candidates[0];
        }
      }
    }

    if (!snap) continue;

    matched++;

    await snap.ref.set(
      {
        status,
        scoreHome: Number.isNaN(hs) ? null : hs,
        scoreAway: Number.isNaN(as) ? null : as,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    updated++;
  }

  console.log("[runNbaScoresSync] done", {
    total: games.length,
    matched,
    updated,
  });

  return { total: games.length, matched, updated };
}

export const syncNBAGamesNow = onCall(
  { cors: true, secrets: [ODDS_API_KEY] },
  async (req) => {
    try {
      await requireAdmin(req);

      const eventsRes = await runNbaEventsSync();
      const oddsRes = await runNbaOddsSync({ force: true });
      const scoresRes = await runNbaScoresSync();

      return {
        ok: true,
        mode: "manual-nba-full-sync",
        events: eventsRes ?? null,
        odds: oddsRes ?? null,
        scores: scoresRes ?? null,
      };
    } catch (error: any) {
      console.error("[syncNBAGamesNow] FAILED", {
        message: error?.message ?? null,
        code: error?.code ?? null,
        details: error?.details ?? null,
        stack: error?.stack ?? null,
        axiosStatus: error?.response?.status ?? null,
        axiosData: error?.response?.data ?? null,
      });

      const msg =
        error?.message ||
        error?.response?.data?.message ||
        error?.response?.statusText ||
        "syncNBAGamesNow failed";

      throw new HttpsError("internal", msg);
    }
  },
);

export const importNBAGamesDaily = onSchedule(
  { schedule: "0 5 * * *", timeZone: "America/Puerto_Rico" },
  async () => {
    console.log("[importNBAGamesDaily] legacy disabled");
  },
);

export const refreshNBAGamesEvery30Min = onSchedule(
  { schedule: "every 30 minutes", timeZone: "America/Puerto_Rico" },
  async () => {
    console.log("[refreshNBAGamesEvery30Min] legacy disabled");
  },
);

/**
 * 1) EVENTS: crea/actualiza juegos futuros (schedule)
 *    - Corre 1 vez al día
 */
export const syncNbaEvents = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
  },
  async () => {
    await runNbaEventsSync();
  },
);

/**
 * 2) ODDS: actualiza moneyline + spreads + totals desde DraftKings
 *    - Corre cada 4 horas para ahorrar créditos
 */
export const syncNbaOdds = onSchedule(
  {
    schedule: "every 4 hours",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
  },
  async () => {
    await runNbaOddsSync();
  },
);

/**
 * 3) SCORES: GRATIS (NBA official) - marca status + scores (final/live/scheduled)
 *    - Corre cada 10 minutos
 */
export const syncNbaScores = onSchedule(
  {
    schedule: "*/10 * * * *",
    timeZone: "America/Puerto_Rico",
  },
  async () => {
    await runNbaScoresSync();
  },
);

// =============================
// ODDS API (MLB) - Scheduled Jobs (v2)
// =============================
const MLB_TEAM_MAP: Record<string, string> = {
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
  "Seattle Mariners": "SEA",
  "San Francisco Giants": "SF",
  "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX",
  "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH",
};

function mlbAbbr(name: string) {
  return MLB_TEAM_MAP[name] ?? null;
}

function inMlbOddsWindow() {
  const now = prNow();
  const hour = now.getHours();
  return hour >= 11 && hour <= 23;
}

async function runMlbEventsSync() {
  const apiKey = ODDS_API_KEY.value();
  const url = "https://api.the-odds-api.com/v4/sports/baseball_mlb/events";

  const { data } = await axios.get(url, {
    params: { apiKey, dateFormat: "iso" },
    timeout: 20000,
  });

  let upserted = 0;
  let skipped = 0;

  for (const ev of data as Array<any>) {
    const home = mlbAbbr(ev.home_team);
    const away = mlbAbbr(ev.away_team);
    if (!home || !away) {
      skipped++;
      continue;
    }

    const commence = new Date(ev.commence_time);
    if (Number.isNaN(commence.getTime())) {
      skipped++;
      continue;
    }

    const dateKey = yyyymmddFromIso(ev.commence_time);
    const matchKey = `MLB_${dateKey}_${home}_${away}`;

    const weekId = getWeekId(commence);
    const gameId = `${dateKey}_${String(ev.id).slice(0, 20)}`;
    const docId = gameDocId("MLB", weekId, gameId);

    await db
      .collection("games")
      .doc(docId)
      .set(
        {
          league: "MLB",
          sport: "MLB",
          weekId,
          gameId,
          matchKey,
          oddsEventId: String(ev.id),
          homeTeam: home,
          awayTeam: away,
          startTime: admin.firestore.Timestamp.fromDate(commence),
          status: "scheduled",
          scoreHome: null,
          scoreAway: null,
          source: "oddsapi",
          createdAt: nowTs(),
          updatedAt: nowTs(),
        },
        { merge: true },
      );

    upserted++;
  }

  console.log("[runMlbEventsSync] done", { upserted, skipped });
  return { upserted, skipped };
}

async function runMlbOddsSync(opts?: { force?: boolean }) {
  const force = opts?.force === true;

  if (!force && !inMlbOddsWindow()) {
    console.log("[runMlbOddsSync] skipped: outside PR odds window");
    return { updated: 0, skipped: 0, reason: "outside-window" };
  }

  const apiKey = ODDS_API_KEY.value();
  const url = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds";

  const { data } = await axios.get(url, {
    params: {
      apiKey,
      regions: "us",
      markets: "h2h,spreads,totals",
      bookmakers: "draftkings",
      oddsFormat: "american",
      dateFormat: "iso",
    },
    timeout: 20000,
  });

  let updated = 0;
  let skipped = 0;

  const findOutcome = (m: any, name: string) =>
    (m?.outcomes ?? []).find((o: any) => o?.name === name);

  for (const ev of data as Array<any>) {
    const home = mlbAbbr(ev.home_team);
    const away = mlbAbbr(ev.away_team);
    if (!home || !away) {
      skipped++;
      continue;
    }

    const commence = new Date(ev.commence_time);
    if (Number.isNaN(commence.getTime())) {
      skipped++;
      continue;
    }

    const dateKey = yyyymmddFromIso(ev.commence_time);
    if (!dateKey) {
      skipped++;
      continue;
    }

    const matchKey = `MLB_${dateKey}_${home}_${away}`;

    const book = (ev.bookmakers ?? [])[0];
    if (!book) {
      skipped++;
      continue;
    }

    const markets = book.markets ?? [];
    const mH2H = markets.find((m: any) => m.key === "h2h");
    const mSP = markets.find((m: any) => m.key === "spreads");
    const mTOT = markets.find((m: any) => m.key === "totals");

    const homeML = findOutcome(mH2H, ev.home_team)?.price ?? null;
    const awayML = findOutcome(mH2H, ev.away_team)?.price ?? null;

    const homeSP = findOutcome(mSP, ev.home_team);
    const awaySP = findOutcome(mSP, ev.away_team);

    const overTOT = findOutcome(mTOT, "Over");
    const underTOT = findOutcome(mTOT, "Under");

    const payload: any = {
      oddsEventId: String(ev.id ?? ""),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      markets: {
        moneyline:
          homeML != null && awayML != null
            ? { home: homeML, away: awayML }
            : null,
        spread:
          homeSP?.point != null && awaySP?.point != null
            ? {
                homeLine: Number(homeSP.point),
                awayLine: Number(awaySP.point),
                homeOdds: homeSP.price ?? null,
                awayOdds: awaySP.price ?? null,
              }
            : null,
        total:
          overTOT?.point != null && underTOT?.point != null
            ? {
                line: Number(overTOT.point),
                overOdds: overTOT.price ?? null,
                underOdds: underTOT.price ?? null,
              }
            : null,
      },
    };

    const snap = await db
      .collection("games")
      .where("matchKey", "==", matchKey)
      .limit(1)
      .get();

    if (snap.empty) {
      skipped++;
      continue;
    }

    const game = snap.docs[0].data() as any;
    const status = String(game?.status ?? "").toLowerCase();

    if (status === "final" || status === "inprogress") {
      skipped++;
      continue;
    }

    await snap.docs[0].ref.set(payload, { merge: true });
    updated++;
  }

  console.log("[runMlbOddsSync] done", { updated, skipped, force });
  return { updated, skipped };
}
export const syncMLBGamesNow = onCall(
  { cors: true, secrets: [ODDS_API_KEY] },
  async (req) => {
    await requireAdmin(req);

    await runMlbEventsSync();
    await runMlbOddsSync({ force: true });

    return { ok: true, mode: "manual-mlb-sync" };
  },
);

/**
 * MLB EVENTS: crea/actualiza juegos futuros
 * - Corre 1 vez al día
 */
export const syncMlbEvents = onSchedule(
  {
    schedule: "30 8 * * *",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
  },
  async () => {
    await runMlbEventsSync();
  },
);

/**
 * MLB ODDS: solo moneyline por ahora
 * - Corre cada 6 horas para ahorrar créditos
 */
export const syncMlbOdds = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
  },
  async () => {
    await runMlbOddsSync();
  },
);

/** ===== (3) Ensure leaderboard docs exist when a pick exists ===== */
export const onPickWriteEnsureLeaderboard = onDocumentWritten(
  "picks/{pickId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const pick = after.data() as any;
    const uid = String(pick.uid || "");
    if (!uid) return;

    const rawSport = pick.sport ?? pick.league ?? pick.tournamentSport ?? "";
    const sportStr = String(rawSport).toUpperCase();
    if (sportStr !== "NBA" && sportStr !== "MLB") return;

    let weekId = String(pick.weekId ?? pick.week ?? "");
    if (!weekId) {
      const created =
        pick.createdAt?.toDate?.() ??
        (typeof pick.createdAt === "string"
          ? new Date(pick.createdAt)
          : null) ??
        (typeof pick.createdAt === "number" ? new Date(pick.createdAt) : null);

      weekId = getWeekId(
        created instanceof Date && !Number.isNaN(created.getTime())
          ? created
          : new Date(),
      );
    }

    const sport = sportStr as Sport;

    const lbId = leaderboardDocId(weekId, sport);
    const lbRef = db.collection("leaderboards").doc(lbId);
    const userRef = lbRef.collection("users").doc(uid);

    const entryId = leaderboardEntryDocId(weekId, sport, uid);
    const entryRef = db.collection("leaderboardsEntries").doc(entryId);

    const profileRef = db.collection("users").doc(uid);

    const initTotals = { points: 0, wins: 0, losses: 0, pushes: 0, picks: 0 };
    const initML = {
      pointsML: 0,
      winsML: 0,
      lossesML: 0,
      pushesML: 0,
      picksML: 0,
    };
    const initSpread = {
      pointsSpread: 0,
      winsSpread: 0,
      lossesSpread: 0,
      pushesSpread: 0,
      picksSpread: 0,
    };
    const initOU = {
      pointsOU: 0,
      winsOU: 0,
      lossesOU: 0,
      pushesOU: 0,
      picksOU: 0,
    };

    await db.runTransaction(async (tx) => {
      const [lbSnap, userSnap, entrySnap, profileSnap] = await Promise.all([
        tx.get(lbRef),
        tx.get(userRef),
        tx.get(entryRef),
        tx.get(profileRef),
      ]);

      const profile = profileSnap.exists ? (profileSnap.data() as any) : {};
      const username = profile?.username ?? profile?.displayName ?? null;

      if (!lbSnap.exists) {
        tx.set(
          lbRef,
          {
            sport,
            weekId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      if (!userSnap.exists) {
        tx.set(
          userRef,
          {
            uid,
            ...(username ? { username, displayName: username } : {}),
            ...initTotals,
            ...initML,
            ...initSpread,
            ...initOU,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      if (!entrySnap.exists) {
        tx.set(
          entryRef,
          {
            uid,
            sport,
            weekId,
            ...(username ? { username, displayName: username } : {}),
            ...initTotals,
            ...initML,
            ...initSpread,
            ...initOU,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      if (username) {
        tx.set(
          userRef,
          {
            username,
            displayName: username,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        tx.set(
          entryRef,
          {
            username,
            displayName: username,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      tx.set(after.ref, { lbEnsured: true, lbId, entryId }, { merge: true });
    });
  },
);

/** ===== Leaderboard increment helpers ===== */

/**
 * ✅ Suma puntos a:
 * 1) leaderboards/{weekId_sport}/users/{uid}
 * 2) leaderboardsEntries/{weekId_sport_uid}
 */
function applyLeaderboardForPickTx(
  tx: FirebaseFirestore.Transaction,
  pick: any,
  result: Exclude<PickResult, "pending">,
  points: number,
) {
  const uid = String(pick.uid ?? "").trim();
  const weekId = String(pick.weekId ?? "").trim();
  const sportStr = String(pick.sport ?? pick.league ?? "NBA").toUpperCase();

  if (!uid || !weekId) return;
  if (sportStr !== "NBA" && sportStr !== "MLB") return;

  const sport = sportStr as Sport;

  const lbId = leaderboardDocId(weekId, sport);
  const entryId = leaderboardEntryDocId(weekId, sport, uid);

  const lbRef = db.collection("leaderboards").doc(lbId);
  const entryRef = db.collection("leaderboardsEntries").doc(entryId);

  const winInc = result === "win" ? 1 : 0;
  const lossInc = result === "loss" ? 1 : 0;
  const pushInc = result === "push" ? 1 : 0;

  tx.set(
    lbRef,
    {
      weekId,
      sport,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  tx.set(
    entryRef,
    {
      uid,
      weekId,
      sport,
      points: admin.firestore.FieldValue.increment(points),
      wins: admin.firestore.FieldValue.increment(winInc),
      losses: admin.firestore.FieldValue.increment(lossInc),
      pushes: admin.firestore.FieldValue.increment(pushInc),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // 👇 IMPORTANTE:
  // NO tocamos users.points aquí para evitar doble suma/inconsistencias
  // entre resolución automática y recomputes manuales.
}

/** ===== Pick resolve helpers (real win/loss/push) ===== */
function getGameLine(
  game: any,
  market: Market,
  selection: PickSelection,
): number | null {
  const m = game?.markets ?? {};

  if (market === "spread") {
    const homeLine = m?.spread?.homeLine;
    const awayLine = m?.spread?.awayLine;
    if (selection === "home" && typeof homeLine === "number") return homeLine;
    if (selection === "away" && typeof awayLine === "number") return awayLine;
    return null;
  }

  if (market === "total" || market === "ou") {
    const totalLine = m?.total?.line;
    return typeof totalLine === "number" ? totalLine : null;
  }

  return null;
}

function computePickResult(
  game: any,
  pick: any,
): Exclude<PickResult, "pending"> {
  const homeScore = Number(game?.scoreHome ?? 0);
  const awayScore = Number(game?.scoreAway ?? 0);

  const market = String(pick?.market ?? "moneyline").toLowerCase() as Market;
  const selection = String(
    pick?.selection ?? "",
  ).toLowerCase() as PickSelection;

  const lineFromPick = typeof pick?.line === "number" ? pick.line : null;
  const line = lineFromPick ?? getGameLine(game, market, selection);

  // MONEYLINE
  if (market === "moneyline") {
    if (homeScore === awayScore) return "push";
    const winner: PickSelection = homeScore > awayScore ? "home" : "away";
    return selection === winner ? "win" : "loss";
  }

  // SPREAD
  if (market === "spread") {
    if (line === null) return "push";
    const marginHome = homeScore - awayScore;

    // selection home -> marginHome + homeLine
    // selection away -> (-marginHome) + awayLine
    const adjusted =
      selection === "home"
        ? marginHome + line
        : selection === "away"
          ? -marginHome + line
          : NaN;

    if (!Number.isFinite(adjusted)) return "push";
    if (adjusted === 0) return "push";
    return adjusted > 0 ? "win" : "loss";
  }

  // TOTAL / OU
  if (market === "total" || market === "ou") {
    if (line === null) return "push";
    const total = homeScore + awayScore;
    if (total === line) return "push";
    if (selection === "over") return total > line ? "win" : "loss";
    if (selection === "under") return total < line ? "win" : "loss";
    return "push";
  }

  return "push";
}

function pointsForResult(result: Exclude<PickResult, "pending">) {
  return result === "win"
    ? POINTS_WIN
    : result === "push"
      ? POINTS_PUSH
      : POINTS_LOSS;
}

/** ===== (4) Resolve picks when game becomes FINAL ===== */
export const onGameWriteResolvePicks = onDocumentWritten(
  "games/{docId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const game = after.data() as any;

    const sportStr = String(game.sport ?? game.league ?? "NBA").toUpperCase();
    if (sportStr !== "NBA" && sportStr !== "MLB") return;
    const sport = sportStr as Sport;

    const status = String(game.status ?? "").toLowerCase();
    if (status !== "final") return;

    const weekId = String(game.weekId ?? "");
    const gameId = String(game.gameId ?? "");
    if (!weekId || !gameId) return;

    const picksSnap = await db
      .collection("picks")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
      .where("gameId", "==", gameId)

      .get();

    if (picksSnap.empty) return;

    await db.runTransaction(async (tx) => {
      for (const docSnap of picksSnap.docs) {
        const pick = docSnap.data() as any;

        const result = computePickResult(game, pick);
        const points = pointsForResult(result);

        const alreadyCorrect =
          pick.result === result && pick.pointsAwarded === points;

        if (alreadyCorrect) continue;

        const wasPending = String(pick.result ?? "pending") === "pending";

        tx.set(
          docSnap.ref,
          {
            result,
            pointsAwarded: points,
            leaderboardApplied: wasPending
              ? true
              : (pick.leaderboardApplied ?? false),
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        if (wasPending) {
          applyLeaderboardForPickTx(tx, pick, result as any, points);
        }
      }
    });
  },
);

/** ===== (5) Finalize NBA leaderboard weekly (Mon 12:05am PR) ===== */
export const finalizeWeeklyLeaderboardNBA = onSchedule(
  { schedule: "5 0 * * 1", timeZone: "America/Puerto_Rico" },
  async () => {
    const sport: Sport = "NBA";

    // Monday 12:05am -> finalize the week that ended Sunday
    const d = new Date();
    d.setDate(d.getDate() - 1); // go to Sunday
    const weekId = getWeekId(d);

    const lbId = leaderboardDocId(weekId, sport);
    const lbRef = db.collection("leaderboards").doc(lbId);

    const lbSnap = await lbRef.get();
    if (lbSnap.exists && (lbSnap.data() as any)?.finalized === true) return;

    const topSnap = await lbRef
      .collection("users")
      .orderBy("points", "desc")
      .limit(3)
      .get();

    if (topSnap.empty) {
      await lbRef.set(
        {
          sport,
          weekId,
          finalized: true,
          finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return;
    }

    const winners = topSnap.docs.map((d) => ({
      uid: d.id,
      ...(d.data() as any),
    }));

    // =========================
    // REWARD POINTS (STORE)
    // =========================

    // TOP 10 leaderboard
    const top10Snap = await lbRef
      .collection("users")
      .orderBy("points", "desc")
      .limit(10)
      .get();

    for (const doc of top10Snap.docs) {
      const uid = doc.id;
      const data = doc.data() as any;

      const wins = Number(data.wins ?? 0);
      const pushes = Number(data.pushes ?? 0);

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const userData = userSnap.data() as any;

      const plan = String(userData?.plan ?? "free").toLowerCase();

      let rp = 0;

      if (plan === "premium") {
        rp += wins * 50;
        rp += pushes * 30;
      } else {
        rp += wins * 20;
        rp += pushes * 10;
      }

      // bonus top10
      rp += 10;

      // bonus winner
      if (doc.id === winners[0]?.uid) {
        rp += 100;
      }

      await userRef.set(
        {
          rewardPoints: admin.firestore.FieldValue.increment(rp),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (rp > 0) {
        await addRewardHistory(
          uid,
          "leaderboard_reward",
          rp,
          `Weekly leaderboard reward for ${weekId}`,
          {
            weekId,
            sport: "NBA",
            wins,
            pushes,
            plan,
          },
        );
      }
    }

    await lbRef.set(
      {
        sport,
        weekId,
        finalized: true,
        finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        winners,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  },
);

// =========================
// ADMIN BACKFILL / RECOMPUTE  (v2 onCall)
// =========================

// helpers usados por recompute (se usan, no causan "unused")
function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

async function recomputeWeekForSport(args: { weekId: string; sport: Sport }) {
  const { weekId, sport } = args;

  const lbId = leaderboardDocId(weekId, sport);
  const lbRef = db.collection("leaderboards").doc(lbId);

  const picksSnap = await db
    .collection("picks")
    .where("sport", "==", sport)
    .where("weekId", "==", weekId)
    .where("result", "in", ["win", "loss", "push"])
    .get();

  const userProfileCache = new Map<
    string,
    { username?: string; displayName?: string }
  >();

  const acc = new Map<
    string,
    {
      uid: string;
      weekId: string;
      sport: Sport;
      username?: string;
      displayName?: string;
      points: number;
      wins: number;
      losses: number;
      pushes: number;
    }
  >();

  for (const doc of picksSnap.docs) {
    const p = doc.data() as any;
    const uid = String(p.uid ?? "").trim();
    if (!uid) continue;

    const result = String(p.result ?? "pending") as PickResult;
    if (result !== "win" && result !== "loss" && result !== "push") continue;

    if (!userProfileCache.has(uid)) {
      const userSnap = await db.collection("users").doc(uid).get();
      const userData = userSnap.exists ? (userSnap.data() as any) : {};
      const username = String(
        userData?.username ?? userData?.displayName ?? "",
      ).trim();

      userProfileCache.set(uid, {
        username: username || undefined,
        displayName: username || undefined,
      });
    }

    const profile = userProfileCache.get(uid) ?? {};

    const row = acc.get(uid) ?? {
      uid,
      weekId,
      sport,
      username: profile.username,
      displayName: profile.displayName,
      points: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
    };

    const points =
      typeof p.pointsAwarded === "number"
        ? Number(p.pointsAwarded)
        : pointsForResult(result);

    row.points += points;
    if (result === "win") row.wins += 1;
    else if (result === "loss") row.losses += 1;
    else if (result === "push") row.pushes += 1;

    acc.set(uid, row);
  }

  const existingSnap = await db
    .collection("leaderboardsEntries")
    .where("sport", "==", sport)
    .where("weekId", "==", weekId)
    .get();

  const batch = db.batch();

  for (const doc of existingSnap.docs) {
    batch.delete(doc.ref);
  }

  batch.set(
    lbRef,
    {
      weekId,
      sport,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  for (const row of acc.values()) {
    const entryId = leaderboardEntryDocId(weekId, sport, row.uid);
    const entryRef = db.collection("leaderboardsEntries").doc(entryId);

    batch.set(
      entryRef,
      {
        uid: row.uid,
        weekId,
        sport,
        ...(row.username
          ? {
              username: row.username,
              displayName: row.displayName ?? row.username,
            }
          : {}),
        points: row.points,
        wins: row.wins,
        losses: row.losses,
        pushes: row.pushes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();

  return {
    ok: true,
    sport,
    weekId,
    resolvedPicks: picksSnap.size,
    leaderboardsEntries: acc.size,
  };
}

export const adminRecomputeNBAWeek = onCall({ cors: true }, async (req) => {
  await requireAdmin(req);

  const weekId = String(req.data?.weekId ?? "").trim();
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    throw new HttpsError(
      "invalid-argument",
      'WeekId inválido. Usa formato "2026-W12".',
    );
  }

  return await recomputeWeekForSport({ weekId, sport: "NBA" });
});

export const adminRecomputeMLBWeek = onCall({ cors: true }, async (req) => {
  await requireAdmin(req);

  const weekId = String(req.data?.weekId ?? "").trim();
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    throw new HttpsError(
      "invalid-argument",
      'WeekId inválido. Usa formato "2026-W12".',
    );
  }

  return await recomputeWeekForSport({ weekId, sport: "MLB" });
});

export const claimDailyLoginReward = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const userRef = db.collection("users").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists ? (snap.data() as any) : {};

    const now = new Date();
    const last = data?.lastDailyRewardAt?.toDate?.() ?? null;

    const sameUtcDay =
      last &&
      last.getUTCFullYear() === now.getUTCFullYear() &&
      last.getUTCMonth() === now.getUTCMonth() &&
      last.getUTCDate() === now.getUTCDate();

    if (sameUtcDay) {
      return {
        ok: true,
        claimed: false,
        rewardPoints: Number(data?.rewardPoints ?? 0),
        message: "Daily reward already claimed today.",
      };
    }

    tx.set(
      userRef,
      {
        rewardPoints: admin.firestore.FieldValue.increment(5),
        lastDailyRewardAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      ok: true,
      claimed: true,
      awardedRP: 5,
    };
  });

  if (result.claimed) {
    await addRewardHistory(uid, "daily_login", 5, "Daily Login Reward");
  }

  return result;
});

export const getLeaderboardWeek = onCall({ cors: true }, async (req) => {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const weekId = String(req.data?.weekId ?? "").trim();
  const sportRaw = String(req.data?.sport ?? "NBA")
    .trim()
    .toUpperCase();
  const marketRaw = String(req.data?.market ?? "ALL")
    .trim()
    .toUpperCase();

  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    throw new HttpsError(
      "invalid-argument",
      'Invalid weekId. Use format "2026-W12".',
    );
  }

  if (sportRaw !== "NBA" && sportRaw !== "MLB") {
    throw new HttpsError("invalid-argument", "Unsupported sport.");
  }

  const sport = sportRaw as "NBA" | "MLB";
  const market = marketRaw as "ALL" | "ML" | "SPREAD" | "OU";

  const orderField =
    market === "ML"
      ? "pointsML"
      : market === "SPREAD"
        ? "pointsSpread"
        : market === "OU"
          ? "pointsOU"
          : "points";

  const snap = await db
    .collection("leaderboardsEntries")
    .where("weekId", "==", weekId)
    .where("sport", "==", sport)
    .orderBy(orderField, "desc")
    .limit(200)
    .get();

  const rows = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return { ok: true, rows };
});

export const getMyPicksWeek = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const weekId = String(req.data?.weekId ?? "").trim();
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    throw new HttpsError(
      "invalid-argument",
      'Invalid weekId. Use format "2026-W12".',
    );
  }

  const [uidSnap, userIdSnap, gamesSnap] = await Promise.all([
    db
      .collection("picks")
      .where("uid", "==", uid)
      .where("weekId", "==", weekId)
      .get(),
    db
      .collection("picks")
      .where("userId", "==", uid)
      .where("weekId", "==", weekId)
      .get(),
    db.collection("games").where("weekId", "==", weekId).get(),
  ]);

  const pickMap = new Map<string, any>();

  for (const doc of uidSnap.docs) {
    pickMap.set(doc.id, { id: doc.id, ...doc.data() });
  }

  for (const doc of userIdSnap.docs) {
    pickMap.set(doc.id, { id: doc.id, ...doc.data() });
  }

  const picks = Array.from(pickMap.values());
  const games = gamesSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return {
    ok: true,
    weekId,
    picks,
    games,
  };
});

export const adminRescoreGame = onCall({ cors: true }, async (req) => {
  try {
    await requireAdmin(req);

    const sportRaw = String(req.data?.sport ?? "")
      .toUpperCase()
      .trim();
    const weekId = String(req.data?.weekId ?? "").trim();
    const gameId = String(req.data?.gameId ?? "").trim();

    if (sportRaw !== "NBA" && sportRaw !== "MLB") {
      throw new HttpsError("invalid-argument", "Invalid sport.");
    }

    if (!weekId || !gameId) {
      throw new HttpsError(
        "invalid-argument",
        "weekId and gameId are required.",
      );
    }

    const sport = sportRaw as Sport;

    const gameSnap = await db
      .collection("games")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
      .where("gameId", "==", gameId)
      .limit(1)
      .get();

    if (gameSnap.empty) {
      throw new HttpsError("not-found", "Game not found.");
    }

    const gameDoc = gameSnap.docs[0];
    const game = gameDoc.data() as any;

    const status = String(game.status ?? "").toLowerCase();
    if (status !== "final") {
      throw new HttpsError("failed-precondition", "Game is not final.");
    }

    const picksSnap = await db
      .collection("picks")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
      .where("gameId", "==", gameId)
      .get();

    if (picksSnap.empty) {
      return { ok: true, rescored: 0, skipped: 0 };
    }

    let rescored = 0;
    let skipped = 0;

    await db.runTransaction(async (tx) => {
      for (const docSnap of picksSnap.docs) {
        const pick = docSnap.data() as any;

        const result = computePickResult(game, pick);
        const points = pointsForResult(result);

        const alreadyCorrect =
          pick.result === result && pick.pointsAwarded === points;

        if (alreadyCorrect) {
          skipped++;
          continue;
        }

        tx.set(
          docSnap.ref,
          {
            result,
            pointsAwarded: points,
            leaderboardApplied: true,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        rescored++;
      }
    });

    return {
      ok: true,
      sport,
      weekId,
      gameId,
      rescored,
      skipped,
    };
  } catch (error: any) {
    console.error("[adminRescoreGame] FAILED", {
      message: error?.message ?? null,
      code: error?.code ?? null,
      details: error?.details ?? null,
      stack: error?.stack ?? null,
    });

    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      error?.message ?? "adminRescoreGame failed",
    );
  }
});
//----------------------------------------------//

export const autoRescoreFinalGames = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "America/Puerto_Rico",
  },
  async () => {
    const finalGamesSnap = await db
      .collection("games")
      .where("status", "==", "final")
      .get();

    if (finalGamesSnap.empty) {
      console.log("[autoRescoreFinalGames] no final games found");
      return;
    }

    let gamesChecked = 0;
    let picksUpdated = 0;

    for (const gameDoc of finalGamesSnap.docs) {
      const game = gameDoc.data() as any;

      const sportStr = String(game.sport ?? game.league ?? "").toUpperCase();
      if (sportStr !== "NBA" && sportStr !== "MLB") continue;

      const sport = sportStr as Sport;
      const weekId = String(game.weekId ?? "").trim();
      const gameId = String(game.gameId ?? "").trim();

      if (!weekId || !gameId) continue;

      const picksSnap = await db
        .collection("picks")
        .where("sport", "==", sport)
        .where("weekId", "==", weekId)
        .where("gameId", "==", gameId)
        .get();

      if (picksSnap.empty) {
        gamesChecked++;
        continue;
      }

      const batch = db.batch();
      let updatedThisGame = 0;

      for (const pickDoc of picksSnap.docs) {
        const pick = pickDoc.data() as any;

        const result = computePickResult(game, pick);
        const points = pointsForResult(result);

        const alreadyCorrect =
          pick.result === result && pick.pointsAwarded === points;

        if (alreadyCorrect) continue;

        batch.set(
          pickDoc.ref,
          {
            result,
            pointsAwarded: points,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        updatedThisGame++;
      }

      if (updatedThisGame > 0) {
        await batch.commit();
        picksUpdated += updatedThisGame;
      }

      gamesChecked++;
    }

    console.log("[autoRescoreFinalGames] done", {
      gamesChecked,
      picksUpdated,
    });
  },
);
