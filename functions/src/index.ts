/* functions/src/index.ts */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import axios from "axios";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();

type Sport = "NBA";
type Market = "moneyline" | "spread" | "total" | "ou";
type PickResult = "pending" | "win" | "loss" | "push";
type PickSelection = "home" | "away" | "over" | "under";

export const placePick = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const sportRaw = String(
    req.data?.sport ?? req.data?.league ?? "NBA",
  ).toUpperCase();
  if (sportRaw !== "NBA")
    throw new HttpsError("invalid-argument", "Unsupported sport.");

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
      .where("sport", "==", "NBA")
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
      .where("sport", "==", "NBA")
      .where("weekId", "==", weekId)
      .where("matchKey", "==", externalGameId)
      .limit(1)
      .get();

    if (!q.empty) gameSnap = q.docs[0];

    if (!gameSnap) {
      q = await db
        .collection("games")
        .where("sport", "==", "NBA")
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

  const pickId = `${uid}_${weekId}_NBA_${gameIdField}_${market}`;
  const pickRef = db.collection("picks").doc(pickId);

  if (clear) {
    await pickRef.delete().catch(() => {});
    return { ok: true, cleared: true, pickId };
  }

  await pickRef.set(
    {
      uid,
      sport: "NBA",
      league: "NBA",
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
function ymd(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function syncNBAGamesForDates(args: { dates: Date[] }) {
  const sport: Sport = "NBA";
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) throw new Error("Missing ODDS_API_KEY.");

  // OddsAPI scores endpoint (trae status + scores)
  // daysFrom: cuantos días hacia atrás incluir
  // Nota: pedimos varios días para cubrir juegos que terminaron ayer/antier
  const maxBackDays = 3;

  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/scores/?daysFrom=${maxBackDays}&apiKey=${apiKey}`;
  const events = await axios.get(url).then((r) => r.data);

  for (const ev of events) {
    // OddsAPI fields típicos:
    // ev.id, ev.commence_time, ev.completed, ev.home_team, ev.away_team, ev.scores
    const commence = new Date(ev.commence_time);
    if (Number.isNaN(commence.getTime())) continue;

    // ✅ gameId compatible con tu esquema actual:
    // "YYYYMMDD_<oddsEventId>"
    const ymdUtc = ymd(
      new Date(
        Date.UTC(
          commence.getUTCFullYear(),
          commence.getUTCMonth(),
          commence.getUTCDate(),
        ),
      ),
    );
    const gameId = `${ymdUtc}_${String(ev.id)}`;

    const weekId = getWeekId(commence);
    const docId = gameDocId(sport, weekId, gameId);
    const ref = db.collection("games").doc(docId);

    // Scores: ev.scores suele ser array [{name, score}]
    let scoreHome: number | null = null;
    let scoreAway: number | null = null;

    if (Array.isArray(ev.scores)) {
      const homeRow = ev.scores.find((x: any) => x?.name === ev.home_team);
      const awayRow = ev.scores.find((x: any) => x?.name === ev.away_team);

      const hs = homeRow?.score;
      const as = awayRow?.score;

      if (hs != null && as != null) {
        const hsNum = Number(hs);
        const asNum = Number(as);
        if (!Number.isNaN(hsNum) && !Number.isNaN(asNum)) {
          scoreHome = hsNum;
          scoreAway = asNum;
        }
      }
    }

    const status: any =
      ev.completed === true
        ? "final"
        : scoreHome != null || scoreAway != null
          ? "inprogress"
          : "scheduled";

    // ✅ OJO: NO te cambio homeTeam/awayTeam para no romper UI (tú ya los guardas abreviados)
    // Solo seteo scores/status y odds ids.
    const payload: any = {
      sport,
      weekId,
      gameId,
      oddsEventId: String(ev.id), // ✅ limpio
      status,
      startTime: admin.firestore.Timestamp.fromDate(commence),

      // ✅ tus campos correctos:
      scoreHome,
      scoreAway,

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await ref.set(payload, { merge: true });
  }
}

export const syncNBAGamesNow = onCall(
  { cors: true, secrets: ["ODDS_API_KEY"] },
  async (req) => {
    await requireAdmin(req);

    // no dependemos de weekId aquí; lo calcula por cada game según commence_time
    const today = new Date();
    const utcToday = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );

    await syncNBAGamesForDates({ dates: [utcToday] });

    return { ok: true };
  },
);
export const importNBAGamesDaily = onSchedule(
  { schedule: "every day 05:00", secrets: ["ODDS_API_KEY"] },
  async () => {
    const today = new Date();
    const utcToday = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    await syncNBAGamesForDates({ dates: [utcToday] });
  },
);

export const refreshNBAGamesEvery30Min = onSchedule(
  { schedule: "every 30 minutes", secrets: ["ODDS_API_KEY"] },
  async () => {
    const today = new Date();
    const utcToday = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    await syncNBAGamesForDates({ dates: [utcToday] });
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
    if (sportStr !== "NBA") return;

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

    const sport: Sport = "NBA";

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
  tx: admin.firestore.Transaction,
  pick: any,
  result: "win" | "loss" | "push",
  points: number,
) {
  const uid = pick.uid;
  if (!uid) return;

  const weekId = String(pick.weekId ?? "");
  const sport = String(pick.sport ?? "NBA").toUpperCase();

  // ==============================
  // ✅ UPDATE USER PROFILE (Dashboard)
  // ==============================
  const userRef = db.collection("users").doc(uid);

  tx.set(
    userRef,
    {
      // tu frontend usa users.points
      points: admin.firestore.FieldValue.increment(points),

      // opcional (si algún día quieres separar)
      totalPoints: admin.firestore.FieldValue.increment(points),

      wins:
        result === "win"
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),

      losses:
        result === "loss"
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),

      pushes:
        result === "push"
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  if (!weekId) return;

  const leaderboardId = `${weekId}_${sport}`;

  // ==============================
  // ✅ WEEKLY leaderboard subcollection (leaderboards/{id}/users/{uid})
  // ==============================
  const lbUserRef = db
    .collection("leaderboards")
    .doc(leaderboardId)
    .collection("users")
    .doc(uid);

  tx.set(
    lbUserRef,
    {
      uid,
      weekId,
      sport,

      username: pick.username ?? null,
      displayName: pick.displayName ?? pick.username ?? null,

      points: admin.firestore.FieldValue.increment(points),
      picks: admin.firestore.FieldValue.increment(1),

      wins:
        result === "win"
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),
      losses:
        result === "loss"
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),
      pushes:
        result === "push"
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // ==============================
  // ✅ FLAT leaderboard entry (leaderboardsEntries/{week_sport_uid})
  // (TU UI LA ESTÁ USANDO)
  // ==============================
  const entryId = `${leaderboardId}_${uid}`; // ej: 2026-W08_NBA_LzGf...
  const lbEntryRef = db.collection("leaderboardsEntries").doc(entryId);

  tx.set(
    lbEntryRef,
    {
      uid,
      weekId,
      sport,
      league: sport, // por si tu UI filtra por league

      username: pick.username ?? null,
      displayName: pick.displayName ?? pick.username ?? null,

      points: admin.firestore.FieldValue.increment(points),
      picks: admin.firestore.FieldValue.increment(1),

      wins:
        result === "win"
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),
      losses:
        result === "loss"
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),
      pushes:
        result === "push"
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
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
    if (sportStr !== "NBA") return;

    const status = String(game.status ?? "").toLowerCase();
    if (status !== "final") return;

    const weekId = String(game.weekId ?? "");
    const gameId = String(game.gameId ?? "");
    if (!weekId || !gameId) return;

    const picksSnap = await db
      .collection("picks")
      .where("sport", "==", "NBA")
      .where("weekId", "==", weekId)
      .where("gameId", "==", gameId)
      .where("result", "==", "pending")
      .get();

    if (picksSnap.empty) return;

    await db.runTransaction(async (tx) => {
      for (const docSnap of picksSnap.docs) {
        const pick = docSnap.data() as any;

        const result = computePickResult(game, pick);
        const points = pointsForResult(result);

        tx.set(
          docSnap.ref,
          {
            result,
            pointsAwarded: points,
            leaderboardApplied: true,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        applyLeaderboardForPickTx(tx, pick, result as any, points);
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

function marketKey(m: string) {
  const x = String(m ?? "").toLowerCase();
  if (x === "moneyline") return "ML";
  if (x === "spread") return "Spread";
  return "OU"; // total / ou
}

export const adminRecomputeNBAWeek = onCall({ cors: true }, async (req) => {
  // ✅ Admin only
  await requireAdmin(req);

  const weekId = String(req.data?.weekId ?? "").trim();
  if (!weekId) {
    throw new HttpsError(
      "invalid-argument",
      'weekId is required. Example: "2026-W08"',
    );
  }

  const sport: Sport = "NBA";
  const lbId = leaderboardDocId(weekId, sport);

  // asegúrate que existe el leaderboard root doc
  await db.collection("leaderboards").doc(lbId).set(
    {
      sport,
      weekId,
      updatedAt: nowTs(),
      createdAt: nowTs(),
    },
    { merge: true },
  );

  // Traer picks resueltos de la semana NBA
  const picksSnap = await db
    .collection("picks")
    .where("sport", "==", sport)
    .where("weekId", "==", weekId)
    .where("result", "in", ["win", "loss", "push"])
    .get();

  if (picksSnap.empty) {
    return { ok: true, weekId, sport, message: "No resolved picks found." };
  }

  type Totals = {
    uid: string;
    username?: string | null;
    displayName?: string | null;
    league?: string | null;
    sport: Sport;
    weekId: string;

    points: number;
    picks: number;
    wins: number;
    losses: number;
    pushes: number;

    pointsML: number;
    pointsSpread: number;
    pointsOU: number;
    picksML: number;
    picksSpread: number;
    picksOU: number;
    winsML: number;
    winsSpread: number;
    winsOU: number;
    lossesML: number;
    lossesSpread: number;
    lossesOU: number;
    pushesML: number;
    pushesSpread: number;
    pushesOU: number;
  };

  const byUid = new Map<string, Totals>();

  function getOrInit(uid: string, base: any): Totals {
    const existing = byUid.get(uid);
    if (existing) return existing;

    const t: Totals = {
      uid,
      username: base?.username ?? null,
      displayName: base?.displayName ?? base?.username ?? null,
      league: base?.league ?? "NBA",
      sport,
      weekId,

      points: 0,
      picks: 0,
      wins: 0,
      losses: 0,
      pushes: 0,

      pointsML: 0,
      pointsSpread: 0,
      pointsOU: 0,
      picksML: 0,
      picksSpread: 0,
      picksOU: 0,
      winsML: 0,
      winsSpread: 0,
      winsOU: 0,
      lossesML: 0,
      lossesSpread: 0,
      lossesOU: 0,
      pushesML: 0,
      pushesSpread: 0,
      pushesOU: 0,
    };

    byUid.set(uid, t);
    return t;
  }

  for (const doc of picksSnap.docs) {
    const p = doc.data() as any;
    const uid = String(p.uid ?? p.userId ?? "");
    if (!uid) continue;

    const result = String(p.result ?? "loss") as PickResult;
    const pointsAwarded = Number(p.pointsAwarded ?? 0) || 0;

    const t = getOrInit(uid, p);

    t.picks += 1;
    t.points += pointsAwarded;

    if (result === "win") t.wins += 1;
    else if (result === "loss") t.losses += 1;
    else t.pushes += 1;

    const mk = marketKey(p.market ?? "moneyline");

    if (mk === "ML") {
      t.picksML += 1;
      t.pointsML += pointsAwarded;
      if (result === "win") t.winsML += 1;
      else if (result === "loss") t.lossesML += 1;
      else t.pushesML += 1;
    } else if (mk === "Spread") {
      t.picksSpread += 1;
      t.pointsSpread += pointsAwarded;
      if (result === "win") t.winsSpread += 1;
      else if (result === "loss") t.lossesSpread += 1;
      else t.pushesSpread += 1;
    } else {
      t.picksOU += 1;
      t.pointsOU += pointsAwarded;
      if (result === "win") t.winsOU += 1;
      else if (result === "loss") t.lossesOU += 1;
      else t.pushesOU += 1;
    }
  }

  const updates: Array<{
    uid: string;
    appliedDiff: number;
    newPoints: number;
  }> = [];

  for (const totals of byUid.values()) {
    const uid = totals.uid;

    const entryId = leaderboardEntryDocId(weekId, sport, uid);
    const entryRef = db.collection("leaderboardsEntries").doc(entryId);

    const lbUserRef = db
      .collection("leaderboards")
      .doc(lbId)
      .collection("users")
      .doc(uid);

    const userRef = db.collection("users").doc(uid);

    // ✅ transaction-safe diff so you DON’T duplicate points
    const diff = await db.runTransaction(async (tx) => {
      const entrySnap = await tx.get(entryRef);
      const prevPoints = entrySnap.exists
        ? Number(entrySnap.data()?.points ?? 0) || 0
        : 0;

      const d = totals.points - prevPoints;

      tx.set(
        entryRef,
        {
          ...totals,
          updatedAt: nowTs(),
          createdAt: entrySnap.exists
            ? (entrySnap.data()?.createdAt ?? nowTs())
            : nowTs(),
        },
        { merge: true },
      );

      tx.set(
        lbUserRef,
        {
          ...totals,
          updatedAt: nowTs(),
          createdAt: nowTs(),
        },
        { merge: true },
      );

      if (d !== 0) {
        tx.set(
          userRef,
          {
            points: admin.firestore.FieldValue.increment(d),
            updatedAt: nowTs(),
          },
          { merge: true },
        );
      }

      return d;
    });

    updates.push({ uid, appliedDiff: diff, newPoints: totals.points });
  }

  return {
    ok: true,
    weekId,
    sport,
    leaderboardId: lbId,
    usersUpdated: updates.length,
    updates,
  };
});

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
  // "2026-02-27T00:10:00Z" -> "20260227"
  return String(iso).slice(0, 10).split("-").join("");
}

function nbaAbbr(name: string) {
  return NBA_TEAM_MAP[name] ?? null;
}

/**
 * 1) EVENTS: crea/actualiza juegos futuros (schedule)
 *    - Corre 1 vez al día
 */
export const syncNbaEvents = onSchedule(
  {
    schedule: "0 8 * * *", // 8:00 AM todos los días
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
  },
  async () => {
    const apiKey = ODDS_API_KEY.value();
    const url = "https://api.the-odds-api.com/v4/sports/basketball_nba/events";

    const { data } = await axios.get(url, {
      params: { apiKey, dateFormat: "iso" },
      timeout: 20000,
    });

    let upserted = 0;
    let skipped = 0;

    for (const ev of data as Array<any>) {
      const home = nbaAbbr(ev.home_team);
      const away = nbaAbbr(ev.away_team);
      if (!home || !away) {
        skipped++;
        continue;
      }

      const commence = new Date(ev.commence_time);
      const dateKey = yyyymmddFromIso(ev.commence_time);
      const matchKey = `NBA_${dateKey}_${home}_${away}`;

      // usa tu helper existente getWeekId()
      const weekId = getWeekId(commence);

      // gameId parecido a tus scripts: fecha + oddsEventId
      const gameId = `${dateKey}_${String(ev.id).slice(0, 20)}`;
      const docId = `NBA_${weekId}_${gameId}`;

      await db
        .collection("games")
        .doc(docId)
        .set(
          {
            league: "NBA",
            sport: "NBA",
            weekId,
            gameId,
            matchKey,
            oddsEventId: ev.id,
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

    console.log(`[syncNbaEvents] upserted=${upserted} skipped=${skipped}`);
  },
);

/**
 * 2) ODDS: actualiza moneyline + spreads + totals desde DraftKings
 * - Corre cada 2 horas (ahorra créditos)
 */
export const syncNbaOdds = onSchedule(
  {
    schedule: "every 2 hours",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
  },
  async () => {
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

      const dateKey = yyyymmddFromIso(ev.commence_time);
      if (!dateKey) {
        skipped++;
        continue;
      }

      const matchKey = `NBA_${dateKey}_${home}_${away}`;

      const book = (ev.bookmakers ?? [])[0];
      if (!book) {
        skipped++;
        continue;
      }

      const markets = book.markets ?? [];
      const mH2H = markets.find((m: any) => m.key === "h2h");
      const mSP = markets.find((m: any) => m.key === "spreads");
      const mTOT = markets.find((m: any) => m.key === "totals");

      // moneyline
      const homeML = findOutcome(mH2H, ev.home_team)?.price ?? null;
      const awayML = findOutcome(mH2H, ev.away_team)?.price ?? null;

      // spread
      const homeSP = findOutcome(mSP, ev.home_team);
      const awaySP = findOutcome(mSP, ev.away_team);

      // totals
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

      await snap.docs[0].ref.set(payload, { merge: true });
      updated++;
    }

    console.log("syncNbaOdds done", { updated, skipped });
  },
);

/**
 * 3) SCORES: GRATIS (NBA official) - marca status + scores (final/live/scheduled)
 * - Corre cada 10 minutos
 */
export const syncNbaScores = onSchedule(
  {
    schedule: "*/10 * * * *",
    timeZone: "America/Puerto_Rico",
  },
  async () => {
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

    const dateKeyPR = (d: Date) => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Puerto_Rico",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(d);

      const y = parts.find((p) => p.type === "year")?.value ?? "";
      const m = parts.find((p) => p.type === "month")?.value ?? "";
      const day = parts.find((p) => p.type === "day")?.value ?? "";
      if (!y || !m || !day) return "";
      return `${y}${m}${day}`;
    };

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

      const iso = String(g?.gameTimeUTC ?? "");
      const d = iso ? new Date(iso) : null;
      if (!d || Number.isNaN(d.getTime())) continue;

      const dateKey = dateKeyPR(d);
      if (!dateKey) continue;

      const matchKey = `NBA_${dateKey}_${home}_${away}`;

      const snap = await db
        .collection("games")
        .where("matchKey", "==", matchKey)
        .limit(1)
        .get();

      if (snap.empty) continue;

      matched++;

      await snap.docs[0].ref.set(
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

    console.log("syncNbaScores done", {
      total: games.length,
      matched,
      updated,
    });
  },
);

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
