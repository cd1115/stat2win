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

type NotificationType =
  | "pregame_reminder"
  | "pick_win"
  | "pick_loss"
  | "pick_push"
  | "reward_points"
  | "daily_reward"
  | "leaderboard_reward";

function notificationDocId(uid: string, type: string, dedupeKey: string) {
  const safe = String(dedupeKey ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 140);
  return `${uid}_${type}_${safe}`;
}

function marketLabel(market: string) {
  const raw = String(market ?? "").toLowerCase();
  if (raw === "moneyline") return "ML";
  if (raw === "spread") return "SP";
  if (raw === "ou" || raw === "total") return "OU";
  return raw.toUpperCase() || "PICK";
}

function pickSelectionLabel(pick: any) {
  const market = String(pick?.market ?? "").toLowerCase();
  const selection = String(pick?.selection ?? pick?.pick ?? "").toLowerCase();
  const line =
    typeof pick?.line === "number" && Number.isFinite(pick.line)
      ? Number(pick.line)
      : null;

  if (market === "moneyline") {
    return selection === "home"
      ? "Home ML"
      : selection === "away"
        ? "Away ML"
        : "ML";
  }

  if (market === "spread") {
    if (line === null) return selection === "home" ? "Home Spread" : "Away Spread";
    const sign = line > 0 ? "+" : "";
    return `${selection === "home" ? "Home" : "Away"} ${sign}${line}`;
  }

  if (market === "ou" || market === "total") {
    if (line === null) return selection === "over" ? "OVER" : "UNDER";
    return `${selection === "over" ? "OVER" : "UNDER"} ${line}`;
  }

  return selection.toUpperCase() || "PICK";
}

function gameLabel(game: any) {
  const away = String(game?.awayTeam ?? "").trim();
  const home = String(game?.homeTeam ?? "").trim();
  if (away && home) return `${away} @ ${home}`;
  return "your game";
}

async function createNotification(args: {
  uid: string;
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey?: string | null;
  ctaUrl?: string | null;
  meta?: Record<string, any>;
}) {
  const uid = String(args.uid ?? "").trim();
  if (!uid) return null;

  const type = args.type;
  const dedupeKey =
    String(args.dedupeKey ?? "").trim() ||
    `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const ref = db
    .collection("notifications")
    .doc(notificationDocId(uid, type, dedupeKey));

  await ref.set(
    {
      uid,
      type,
      title: String(args.title ?? "").trim(),
      body: String(args.body ?? "").trim(),
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ctaUrl: args.ctaUrl ?? null,
      meta: args.meta ?? {},
    },
    { merge: false },
  );

  return ref.id;
}

async function createRewardNotification(args: {
  uid: string;
  amount: number;
  title: string;
  body: string;
  dedupeKey: string;
  meta?: Record<string, any>;
}) {
  await createNotification({
    uid: args.uid,
    type: "reward_points",
    title: args.title,
    body: args.body,
    dedupeKey: args.dedupeKey,
    ctaUrl: "/store",
    meta: {
      rewardPoints: args.amount,
      ...(args.meta ?? {}),
    },
  });
}

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

async function addRewardHistoryAndNotify(
  userId: string,
  type: string,
  amount: number,
  description: string,
  meta: Record<string, any> = {},
) {
  await addRewardHistory(userId, type, amount, description, meta);

  let title = "Reward points added";
  if (type === "daily_login") title = "Daily reward claimed";
  if (type === "leaderboard_reward") title = "Leaderboard reward earned";

  await createRewardNotification({
    uid: userId,
    amount,
    title,
    body: `${description} +${amount} RP`,
    dedupeKey: `${type}_${meta?.weekId ?? ""}_${meta?.sport ?? ""}_${amount}`,
    meta: {
      rewardType: type,
      description,
      ...meta,
    },
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

function selectBestBookmaker(ev: any) {
  const books = Array.isArray(ev?.bookmakers) ? ev.bookmakers : [];
  if (!books.length) return null;

  const scoreBook = (book: any) => {
    const markets = Array.isArray(book?.markets) ? book.markets : [];
    const hasH2H = markets.some((m: any) => m?.key === "h2h");
    const hasSpreads = markets.some((m: any) => m?.key === "spreads");
    const hasTotals = markets.some((m: any) => m?.key === "totals");

    let score = 0;
    if (String(book?.key ?? "").toLowerCase() === "draftkings") score += 10;
    if (hasH2H) score += 3;
    if (hasSpreads) score += 3;
    if (hasTotals) score += 3;
    return score;
  };

  return [...books].sort((a, b) => scoreBook(b) - scoreBook(a))[0] ?? null;
}


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

    const book = selectBestBookmaker(ev);
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

function ymdLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mlbApiStatusToGameStatus(
  game: any,
): "scheduled" | "inprogress" | "final" {
  const abstractState = String(
    game?.status?.abstractGameState ?? "",
  ).toLowerCase();
  const detailedState = String(game?.status?.detailedState ?? "").toLowerCase();
  const codedState = String(game?.status?.codedGameState ?? "").toUpperCase();

  if (
    abstractState === "final" ||
    detailedState.includes("final") ||
    codedState === "F" ||
    codedState === "O"
  ) {
    return "final";
  }

  if (
    abstractState === "live" ||
    (abstractState === "preview" && detailedState.includes("warmup")) ||
    detailedState.includes("in progress") ||
    detailedState.includes("manager challenge") ||
    detailedState.includes("review") ||
    codedState === "I" ||
    codedState === "M" ||
    codedState === "N"
  ) {
    return "inprogress";
  }

  return "scheduled";
}

async function findBestStoredMlbGameDoc(args: {
  home: string;
  away: string;
  startAt: Date;
  mlbGamePk?: string | number | null;
}) {
  const home = String(args.home ?? "").toUpperCase().trim();
  const away = String(args.away ?? "").toUpperCase().trim();
  const startAt = args.startAt;
  const mlbGamePk = String(args.mlbGamePk ?? "").trim();

  if (!home || !away) return null;
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) return null;

  if (mlbGamePk) {
    const byPk = await db
      .collection("games")
      .where("sport", "==", "MLB")
      .where("mlbGamePk", "==", mlbGamePk)
      .limit(1)
      .get();

    if (!byPk.empty) return byPk.docs[0];
  }

  const q = await db
    .collection("games")
    .where("sport", "==", "MLB")
    .where("homeTeam", "==", home)
    .where("awayTeam", "==", away)
    .limit(10)
    .get();

  if (q.empty) return null;

  const candidates = q.docs.filter((doc) => {
    const existing = doc.data() as any;
    const existingStart = existing?.startTime?.toDate?.() ?? null;
    if (
      !(existingStart instanceof Date) ||
      Number.isNaN(existingStart.getTime())
    ) {
      return false;
    }
    const diffMs = Math.abs(existingStart.getTime() - startAt.getTime());
    return diffMs <= 36 * 60 * 60 * 1000;
  });

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const aStart = (a.data() as any)?.startTime?.toDate?.()?.getTime?.() ?? 0;
    const bStart = (b.data() as any)?.startTime?.toDate?.()?.getTime?.() ?? 0;
    return Math.abs(aStart - startAt.getTime()) - Math.abs(bStart - startAt.getTime());
  });

  return candidates[0];
}

function getMlbApiGameSnapshot(game: any) {
  const home = String(
    game?.teams?.home?.team?.abbreviation ?? "",
  ).toUpperCase();
  const away = String(
    game?.teams?.away?.team?.abbreviation ?? "",
  ).toUpperCase();

  const startAt = game?.gameDate ? new Date(game.gameDate) : null;
  if (!home || !away) return null;
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) return null;

  const scoreHomeRaw = game?.teams?.home?.score;
  const scoreAwayRaw = game?.teams?.away?.score;

  const scoreHome =
    typeof scoreHomeRaw === "number" && Number.isFinite(scoreHomeRaw)
      ? scoreHomeRaw
      : null;
  const scoreAway =
    typeof scoreAwayRaw === "number" && Number.isFinite(scoreAwayRaw)
      ? scoreAwayRaw
      : null;

  return {
    mlbGamePk: String(game?.gamePk ?? "").trim() || null,
    home,
    away,
    startAt,
    status: mlbApiStatusToGameStatus(game),
    scoreHome,
    scoreAway,
  };
}

async function runMlbStatusFallbackSync(apiSnapshots?: Array<any>) {
  const now = prNow();
  const snapshots = Array.isArray(apiSnapshots) ? apiSnapshots : [];

  const [scheduledSnap, inprogressSnap] = await Promise.all([
    db.collection("games").where("sport", "==", "MLB").where("status", "==", "scheduled").get(),
    db.collection("games").where("sport", "==", "MLB").where("status", "==", "inprogress").get(),
  ]);

  const docs = [...scheduledSnap.docs, ...inprogressSnap.docs];

  let checked = 0;
  let forcedLive = 0;
  let finalized = 0;
  let reviewMarked = 0;
  let unchanged = 0;

  for (const doc of docs) {
    const game = doc.data() as any;
    const startAt = game?.startTime?.toDate?.() ?? null;
    const currentStatus = String(game?.status ?? "").toLowerCase();

    if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) {
      unchanged++;
      continue;
    }

    const elapsedMs = now.getTime() - startAt.getTime();
    if (currentStatus === "scheduled" && elapsedMs < 15 * 60 * 1000) {
      unchanged++;
      continue;
    }

    checked++;

    const home = String(game?.homeTeam ?? "").toUpperCase().trim();
    const away = String(game?.awayTeam ?? "").toUpperCase().trim();
    const storedPk = String(game?.mlbGamePk ?? "").trim();

    let apiMatch =
      snapshots.find((g) => storedPk && String(g?.mlbGamePk ?? "") === storedPk) ??
      null;

    if (!apiMatch) {
      const candidates = snapshots.filter((g) => {
        if (String(g?.home ?? "").toUpperCase() !== home) return false;
        if (String(g?.away ?? "").toUpperCase() !== away) return false;
        const apiStart = g?.startAt instanceof Date ? g.startAt : null;
        if (!(apiStart instanceof Date) || Number.isNaN(apiStart.getTime())) {
          return false;
        }
        const diffMs = Math.abs(apiStart.getTime() - startAt.getTime());
        return diffMs <= 36 * 60 * 60 * 1000;
      });

      if (candidates.length) {
        candidates.sort((a, b) => {
          const aStart = a.startAt instanceof Date ? a.startAt.getTime() : 0;
          const bStart = b.startAt instanceof Date ? b.startAt.getTime() : 0;
          return Math.abs(aStart - startAt.getTime()) - Math.abs(bStart - startAt.getTime());
        });
        apiMatch = candidates[0];
      }
    }

    const payload: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      fallbackStatusAt: admin.firestore.FieldValue.serverTimestamp(),
      fallbackAutoStatus: true,
    };

    if (apiMatch) {
      payload.mlbGamePk = apiMatch.mlbGamePk ?? game?.mlbGamePk ?? null;

      if (apiMatch.status === "final") {
        payload.status = "final";
        payload.scoreHome = apiMatch.scoreHome;
        payload.scoreAway = apiMatch.scoreAway;
        payload.needsScoreReview = false;
        payload.fallbackReason = "api-final-recovered";
        await doc.ref.set(payload, { merge: true });
        finalized++;
        continue;
      }

      if (apiMatch.status === "inprogress") {
        payload.status = "inprogress";
        payload.scoreHome = apiMatch.scoreHome;
        payload.scoreAway = apiMatch.scoreAway;
        payload.needsScoreReview = false;
        payload.fallbackReason = "api-live-recovered";
        await doc.ref.set(payload, { merge: true });
        forcedLive++;
        continue;
      }
    }

    if (currentStatus === "scheduled") {
      payload.status = "inprogress";
      payload.needsScoreReview = false;
      payload.fallbackReason =
        elapsedMs >= 8 * 60 * 60 * 1000 ? "stale-scheduled-over-8h" : "past-start-over-15m";
      await doc.ref.set(payload, { merge: true });
      forcedLive++;
      continue;
    }

    const hasNoScores = game?.scoreHome == null && game?.scoreAway == null;
    if (currentStatus === "inprogress" && elapsedMs >= 6 * 60 * 60 * 1000 && hasNoScores) {
      payload.needsScoreReview = true;
      payload.fallbackReason = "stale-inprogress-no-score-over-6h";
      await doc.ref.set(payload, { merge: true });
      reviewMarked++;
      continue;
    }

    unchanged++;
  }

  console.log("[runMlbStatusFallbackSync] done", {
    checked,
    forcedLive,
    finalized,
    reviewMarked,
    unchanged,
  });

  return { checked, forcedLive, finalized, reviewMarked, unchanged };
}

async function runMlbScoresSync() {
  const baseUrl = "https://statsapi.mlb.com/api/v1/schedule";
  const pr = prNow();
  const dates = [-2, -1, 0, 1].map((offset) => {
    const d = new Date(pr);
    d.setDate(d.getDate() + offset);
    return ymdLocal(d);
  });

  let total = 0;
  let matched = 0;
  let updated = 0;
  const apiSnapshots: Array<any> = [];

  for (const date of dates) {
    const { data } = await axios.get(baseUrl, {
      params: {
        sportId: 1,
        date,
        hydrate: "linescore,team",
      },
      timeout: 20000,
      headers: {
        "User-Agent": "Stat2Win/1.0",
        Accept: "application/json",
      },
    });

    const games = (data?.dates ?? []).flatMap((d: any) => d?.games ?? []);
    total += games.length;

    for (const game of games) {
      const snapData = getMlbApiGameSnapshot(game);
      if (!snapData) continue;

      apiSnapshots.push(snapData);

      const storedDoc = await findBestStoredMlbGameDoc({
        home: snapData.home,
        away: snapData.away,
        startAt: snapData.startAt,
        mlbGamePk: snapData.mlbGamePk,
      });

      if (!storedDoc) continue;

      matched++;

      await storedDoc.ref.set(
        {
          mlbGamePk: snapData.mlbGamePk,
          status: snapData.status,
          scoreHome: snapData.scoreHome,
          scoreAway: snapData.scoreAway,
          needsScoreReview: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      updated++;
    }
  }

  const fallback = await runMlbStatusFallbackSync(apiSnapshots);

  console.log("[runMlbScoresSync] done", {
    total,
    matched,
    updated,
    fallback,
  });

  return { total, matched, updated, fallback };
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

    const ref = db.collection("games").doc(docId);
    const existingSnap = await ref.get();
    const existing = existingSnap.exists ? (existingSnap.data() as any) : null;
    const existingStatus = String(existing?.status ?? "").toLowerCase();

    await ref.set(
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
        status:
          existingStatus === "inprogress" || existingStatus === "final"
            ? existingStatus
            : "scheduled",
        scoreHome:
          existingStatus === "inprogress" || existingStatus === "final"
            ? typeof existing?.scoreHome === "number"
              ? existing.scoreHome
              : null
            : null,
        scoreAway:
          existingStatus === "inprogress" || existingStatus === "final"
            ? typeof existing?.scoreAway === "number"
              ? existing.scoreAway
              : null
            : null,
        source: "oddsapi",
        createdAt: existing?.createdAt ?? nowTs(),
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

    const book = selectBestBookmaker(ev);
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

    const events = await runMlbEventsSync();
    const odds = await runMlbOddsSync({ force: true });
    const scores = await runMlbScoresSync();

    return { ok: true, mode: "manual-mlb-sync", events, odds, scores };
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

export const syncMlbScores = onSchedule(
  {
    schedule: "*/10 * * * *",
    timeZone: "America/Puerto_Rico",
  },
  async () => {
    await runMlbScoresSync();
  },
);

export const syncMlbScheduledFallback = onSchedule(
  {
    schedule: "every 20 minutes",
    timeZone: "America/Puerto_Rico",
  },
  async () => {
    await runMlbStatusFallbackSync();
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
  const market = String(pick.market ?? "").toLowerCase();

  const lbId = leaderboardDocId(weekId, sport);
  const entryId = leaderboardEntryDocId(weekId, sport, uid);

  const lbRef = db.collection("leaderboards").doc(lbId);
  const entryRef = db.collection("leaderboardsEntries").doc(entryId);

  const winInc = result === "win" ? 1 : 0;
  const lossInc = result === "loss" ? 1 : 0;
  const pushInc = result === "push" ? 1 : 0;

  const payload: Record<string, any> = {
    uid,
    weekId,
    sport,
    points: admin.firestore.FieldValue.increment(points),
    wins: admin.firestore.FieldValue.increment(winInc),
    losses: admin.firestore.FieldValue.increment(lossInc),
    pushes: admin.firestore.FieldValue.increment(pushInc),
    picks: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (market === "moneyline") {
    payload.pointsML = admin.firestore.FieldValue.increment(points);
    payload.winsML = admin.firestore.FieldValue.increment(winInc);
    payload.lossesML = admin.firestore.FieldValue.increment(lossInc);
    payload.pushesML = admin.firestore.FieldValue.increment(pushInc);
    payload.picksML = admin.firestore.FieldValue.increment(1);
  } else if (market === "spread") {
    payload.pointsSpread = admin.firestore.FieldValue.increment(points);
    payload.winsSpread = admin.firestore.FieldValue.increment(winInc);
    payload.lossesSpread = admin.firestore.FieldValue.increment(lossInc);
    payload.pushesSpread = admin.firestore.FieldValue.increment(pushInc);
    payload.picksSpread = admin.firestore.FieldValue.increment(1);
  } else if (market === "ou" || market === "total") {
    payload.pointsOU = admin.firestore.FieldValue.increment(points);
    payload.winsOU = admin.firestore.FieldValue.increment(winInc);
    payload.lossesOU = admin.firestore.FieldValue.increment(lossInc);
    payload.pushesOU = admin.firestore.FieldValue.increment(pushInc);
    payload.picksOU = admin.firestore.FieldValue.increment(1);
  }

  tx.set(
    lbRef,
    {
      weekId,
      sport,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  tx.set(entryRef, payload, { merge: true });

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

    const notificationsToSend: Array<{
      uid: string;
      result: Exclude<PickResult, "pending">;
      points: number;
      pick: any;
    }> = [];

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
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        if (wasPending) {
          applyLeaderboardForPickTx(tx, pick, result as any, points);
          notificationsToSend.push({
            uid: String(pick.uid ?? "").trim(),
            result,
            points,
            pick,
          });
        }
      }
    });

    for (const item of notificationsToSend) {
      if (!item.uid) continue;

      const type: NotificationType =
        item.result === "win"
          ? "pick_win"
          : item.result === "loss"
            ? "pick_loss"
            : "pick_push";

      const market = marketLabel(item.pick?.market ?? "");
      const selection = pickSelectionLabel(item.pick);
      const title =
        item.result === "win"
          ? "You won your pick"
          : item.result === "loss"
            ? "Pick settled"
            : "Your pick pushed";

      const body =
        item.result === "win"
          ? `${gameLabel(game)} • ${selection} (${market}) won. +${item.points} pts.`
          : item.result === "loss"
            ? `${gameLabel(game)} • ${selection} (${market}) did not hit this time.`
            : `${gameLabel(game)} • ${selection} (${market}) pushed. +${item.points} pts.`;

      await createNotification({
        uid: item.uid,
        type,
        title,
        body,
        dedupeKey: `${weekId}_${gameId}_${item.pick?.market ?? "market"}`,
        ctaUrl: "/my-picks",
        meta: {
          sport,
          weekId,
          gameId,
          market: item.pick?.market ?? null,
          selection: item.pick?.selection ?? item.pick?.pick ?? null,
          result: item.result,
          pointsAwarded: item.points,
        },
      });
    }
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
        await addRewardHistoryAndNotify(
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
  return new Date();
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
      picks: number;

      pointsML: number;
      winsML: number;
      lossesML: number;
      pushesML: number;
      picksML: number;

      pointsSpread: number;
      winsSpread: number;
      lossesSpread: number;
      pushesSpread: number;
      picksSpread: number;

      pointsOU: number;
      winsOU: number;
      lossesOU: number;
      pushesOU: number;
      picksOU: number;
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
      picks: 0,

      pointsML: 0,
      winsML: 0,
      lossesML: 0,
      pushesML: 0,
      picksML: 0,

      pointsSpread: 0,
      winsSpread: 0,
      lossesSpread: 0,
      pushesSpread: 0,
      picksSpread: 0,

      pointsOU: 0,
      winsOU: 0,
      lossesOU: 0,
      pushesOU: 0,
      picksOU: 0,
    };

    const points =
      typeof p.pointsAwarded === "number"
        ? Number(p.pointsAwarded)
        : pointsForResult(result);

    row.points += points;
    row.picks += 1;

    if (result === "win") row.wins += 1;
    else if (result === "loss") row.losses += 1;
    else if (result === "push") row.pushes += 1;

    const market = String(p.market ?? "").toLowerCase();

    if (market === "moneyline") {
      row.pointsML += points;
      row.picksML += 1;
      if (result === "win") row.winsML += 1;
      else if (result === "loss") row.lossesML += 1;
      else if (result === "push") row.pushesML += 1;
    } else if (market === "spread") {
      row.pointsSpread += points;
      row.picksSpread += 1;
      if (result === "win") row.winsSpread += 1;
      else if (result === "loss") row.lossesSpread += 1;
      else if (result === "push") row.pushesSpread += 1;
    } else if (market === "ou" || market === "total") {
      row.pointsOU += points;
      row.picksOU += 1;
      if (result === "win") row.winsOU += 1;
      else if (result === "loss") row.lossesOU += 1;
      else if (result === "push") row.pushesOU += 1;
    }

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
        picks: row.picks,

        pointsML: row.pointsML,
        winsML: row.winsML,
        lossesML: row.lossesML,
        pushesML: row.pushesML,
        picksML: row.picksML,

        pointsSpread: row.pointsSpread,
        winsSpread: row.winsSpread,
        lossesSpread: row.lossesSpread,
        pushesSpread: row.pushesSpread,
        picksSpread: row.picksSpread,

        pointsOU: row.pointsOU,
        winsOU: row.winsOU,
        lossesOU: row.lossesOU,
        pushesOU: row.pushesOU,
        picksOU: row.picksOU,

        updatedAt: new Date(),
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
        lastDailyRewardAt: nowTs(),
      updatedAt: new Date(),
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
    await addRewardHistoryAndNotify(uid, "daily_login", 5, "Daily Login Reward");
    await createNotification({
      uid,
      type: "daily_reward",
      title: "Daily reward claimed",
      body: "You earned 5 RP for logging in today.",
      dedupeKey: `daily_reward_${new Date().toISOString().slice(0, 10)}`,
      ctaUrl: "/store",
      meta: { rewardPoints: 5 },
    });
  }

  return result;
});

export const getMyNotifications = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);
  const limitRaw = Number(req.data?.limit ?? 25);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(50, Math.floor(limitRaw)))
    : 25;

  const snap = await db
    .collection("notifications")
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const items = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const unreadCount = items.filter((x: any) => x.read !== true).length;

  return { ok: true, items, unreadCount };
});

export const markNotificationsRead = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);
  const ids = Array.isArray(req.data?.ids) ? req.data.ids : [];
  const markAll = req.data?.all === true;

  let docs: FirebaseFirestore.DocumentSnapshot[] = [];

  if (markAll) {
    const snap = await db
      .collection("notifications")
      .where("uid", "==", uid)
      .where("read", "==", false)
      .limit(100)
      .get();
    docs = snap.docs;
  } else if (ids.length) {
    const refs = ids
      .map((id: any) => String(id ?? "").trim())
      .filter(Boolean)
      .slice(0, 100)
      .map((id: string) => db.collection("notifications").doc(id));

    const snaps = await db.getAll(...refs);
    docs = snaps.filter((snap) => snap.exists && snap.data()?.uid === uid);
  } else {
    throw new HttpsError("invalid-argument", "ids or all=true is required.");
  }

  if (!docs.length) return { ok: true, updated: 0 };

  const batch = db.batch();
  for (const doc of docs) {
    batch.set(
      doc.ref,
      {
        read: true,
        readAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();

  return { ok: true, updated: docs.length };
});

export const sendPregameReminders = onSchedule(
  {
    schedule: "every 10 minutes",
    timeZone: "America/Puerto_Rico",
  },
  async () => {
    const now = prNow();
    const from = now.getTime() + 10 * 60 * 1000;
    const to = now.getTime() + 30 * 60 * 1000;

    const weekId = getWeekId(now);
    const gamesSnap = await db.collection("games").where("weekId", "==", weekId).get();

    const upcomingGames = gamesSnap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
      .filter((game: any) => {
        const startAt = game?.startTime?.toDate?.() ?? null;
        const status = String(game?.status ?? "").toLowerCase();
        if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) return false;
        if (status === "inprogress" || status === "final") return false;
        const ts = startAt.getTime();
        return ts >= from && ts <= to;
      });

    if (!upcomingGames.length) {
      console.log("[sendPregameReminders] no upcoming games");
      return;
    }

    const picksSnap = await db.collection("picks").where("weekId", "==", weekId).get();
    if (picksSnap.empty) {
      console.log("[sendPregameReminders] no active users for week", weekId);
      return;
    }

    const picksByUid = new Map<string, Set<string>>();
    for (const doc of picksSnap.docs) {
      const pick = doc.data() as any;
      const uid = String(pick?.uid ?? "").trim();
      const gameId = String(pick?.gameId ?? "").trim();
      if (!uid || !gameId) continue;
      const set = picksByUid.get(uid) ?? new Set<string>();
      set.add(gameId);
      picksByUid.set(uid, set);
    }

    let sent = 0;
    for (const game of upcomingGames) {
      const startAt = game?.startTime?.toDate?.() ?? null;
      if (!(startAt instanceof Date)) continue;

      const minutesLeft = Math.max(
        1,
        Math.round((startAt.getTime() - now.getTime()) / 60000),
      );

      for (const [uid, userGameIds] of picksByUid.entries()) {
        if (userGameIds.has(String(game.gameId ?? "").trim())) continue;

        await createNotification({
          uid,
          type: "pregame_reminder",
          title: "Make your pick before lock",
          body: `${gameLabel(game)} starts in about ${minutesLeft} minutes. Make your pick to keep climbing the weekly leaderboard.`,
          dedupeKey: `${weekId}_${game.gameId}_pregame_30m`,
          ctaUrl: "/tournaments",
          meta: {
            sport: game?.sport ?? game?.league ?? null,
            weekId,
            gameId: game?.gameId ?? null,
            gameDocId: game?.id ?? null,
            startsAt: game?.startTime ?? null,
          },
        });
        sent++;
      }
    }

    console.log("[sendPregameReminders] done", {
      weekId,
      games: upcomingGames.length,
      users: picksByUid.size,
      sent,
    });
  },
);

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

export const adminRepairStaleMLBGames = onCall({ cors: true }, async (req) => {
  const weekId = String(req.data?.weekId ?? "").trim();
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    throw new HttpsError(
      "invalid-argument",
      'WeekId inválido. Usa formato "2026-W12".',
    );
  }

  const gamesSnap = await db
    .collection("games")
    .where("sport", "==", "MLB")
    .where("weekId", "==", weekId)
    .where("status", "==", "inprogress")
    .get();

  let checked = 0;
  let repaired = 0;

  const pr = prNow();
  const dates = [-3, -2, -1, 0, 1].map((offset) => {
    const d = new Date(pr);
    d.setDate(d.getDate() + offset);
    return ymdLocal(d);
  });

  const apiSnapshots: Array<any> = [];
  for (const date of dates) {
    const { data } = await axios.get("https://statsapi.mlb.com/api/v1/schedule", {
      params: {
        sportId: 1,
        date,
        hydrate: "linescore,team",
      },
      timeout: 20000,
      headers: {
        "User-Agent": "Stat2Win/1.0",
        Accept: "application/json",
      },
    });

    const games = (data?.dates ?? []).flatMap((d: any) => d?.games ?? []);
    for (const game of games) {
      const snapData = getMlbApiGameSnapshot(game);
      if (snapData) apiSnapshots.push(snapData);
    }
  }

  for (const doc of gamesSnap.docs) {
    checked++;
    const game = doc.data() as any;
    const startAt = game?.startTime?.toDate?.() ?? null;
    const match = await findBestStoredMlbGameDoc({
      home: String(game?.homeTeam ?? ""),
      away: String(game?.awayTeam ?? ""),
      startAt,
      mlbGamePk: String(game?.mlbGamePk ?? ""),
    });
    if (!match || match.id !== doc.id) continue;

    const storedPk = String(game?.mlbGamePk ?? "").trim();
    let apiMatch = apiSnapshots.find((g) => storedPk && String(g?.mlbGamePk ?? "") === storedPk) ?? null;
    if (!apiMatch && startAt instanceof Date) {
      apiMatch =
        apiSnapshots.find((g) =>
          String(g?.home ?? "").toUpperCase() === String(game?.homeTeam ?? "").toUpperCase() &&
          String(g?.away ?? "").toUpperCase() === String(game?.awayTeam ?? "").toUpperCase() &&
          g?.startAt instanceof Date &&
          Math.abs(g.startAt.getTime() - startAt.getTime()) <= 36 * 60 * 60 * 1000
        ) ?? null;
    }

    if (apiMatch?.status === "final") {
      await doc.ref.set(
        {
          mlbGamePk: apiMatch.mlbGamePk ?? game?.mlbGamePk ?? null,
          status: "final",
          scoreHome: apiMatch.scoreHome,
          scoreAway: apiMatch.scoreAway,
          needsScoreReview: false,
          repairedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      repaired++;
    }
  }

  return { ok: true, weekId, checked, repaired };
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

export const ensureUserProfile = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const userRef = db.collection("users").doc(uid);
  const authUser = await admin.auth().getUser(uid);

  const email = authUser.email ?? null;
  const displayName = authUser.displayName ?? null;

  const snap = await userRef.get();

  if (!snap.exists) {
    await userRef.set(
      {
        uid,
        email,
        displayName,
        username: displayName ?? email?.split("@")[0] ?? "user",
        plan: "free",
        rewardPoints: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, created: true };
  }

  await userRef.set(
    {
      uid,
      email,
      displayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, created: false };
});