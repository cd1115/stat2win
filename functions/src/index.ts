import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import axios from "axios";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();

type Sport = "NBA" | "MLB" | "SOCCER";
type Market = "moneyline" | "spread" | "total" | "ou";
type PickResult = "pending" | "win" | "loss" | "push";
type PickSelection = "home" | "away" | "over" | "under" | "draw";

export const placePick = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const sportRaw = String(
    req.data?.sport ?? req.data?.league ?? "NBA",
  ).toUpperCase();
  if (sportRaw !== "NBA" && sportRaw !== "MLB" && sportRaw !== "SOCCER") {
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
    selectionRaw === "under" ||
    selectionRaw === "draw"
      ? (selectionRaw as any)
      : null;

  if (!selection)
    throw new HttpsError("invalid-argument", "Invalid selection.");

  const clear = req.data?.clear === true;

  // ── registration check — user must have joined the weekly tournament ──
  // NOTE: Temporarily disabled for Soccer testing. Re-enable when ready.
  // if (!clear) {
  //   const weeklyTournamentId = `${weekId}_${sport}`;
  //   const regDocId = `${weeklyTournamentId}_${uid}`;
  //   const regSnap = await db
  //     .collection("tournament_registrations")
  //     .doc(regDocId)
  //     .get();
  //   if (!regSnap.exists) {
  //     throw new HttpsError(
  //       "failed-precondition",
  //       "You must join the weekly tournament before making picks.",
  //     );
  //   }
  // }

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
    !(selection === "home" || selection === "away" || selection === "draw")
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Moneyline selection must be home/away/draw.",
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
  | "leaderboard_reward"
  | "streak_bonus";

function notificationDocId(uid: string, type: string, dedupeKey: string) {
  const safe = String(dedupeKey ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 140);
  return `${uid}_${type}_${safe}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAK SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
// Rules:
//   WIN  → streak +1
//   PUSH → streak unchanged (does not break or increment)
//   LOSS → streak resets to 0
//
// Milestone bonuses (awarded once per streak crossing):
//   5  consecutive wins → +300 RP
//   10 consecutive wins → +1000 RP  (also clears the 5-win bonus flag so
//                                     next 5-streak crossing after this rewards again)
//
// Stored in: users/{uid}/streaks/picks  (subcollection)
// Fields: currentStreak, longestStreak, rewarded5, rewarded10
// ─────────────────────────────────────────────────────────────────────────────

const STREAK_5_RP  = 300;
const STREAK_10_RP = 1000;

async function checkAndRewardStreak(uid: string, result: PickResult): Promise<void> {
  if (!uid) return;

  const streakRef = db.collection("users").doc(uid).collection("streaks").doc("picks");

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(streakRef);
    const data = snap.exists ? (snap.data() as any) : {};

    let current   = Number(data.currentStreak  ?? 0);
    let longest   = Number(data.longestStreak  ?? 0);
    let rewarded5  = Boolean(data.rewarded5  ?? false);
    let rewarded10 = Boolean(data.rewarded10 ?? false);

    if (result === "win") {
      current += 1;
      if (current > longest) longest = current;
    } else if (result === "loss") {
      current = 0;
      rewarded5  = false; // reset flags so next streak can earn again
      rewarded10 = false;
    }
    // push → no change

    // Write updated streak doc
    tx.set(streakRef, {
      currentStreak: current,
      longestStreak: longest,
      rewarded5,
      rewarded10,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Check milestones (only on wins, only once per crossing)
    if (result !== "win") return;

    // 10-win milestone
    if (current >= 10 && !rewarded10) {
      tx.set(streakRef, { rewarded10: true }, { merge: true });

      const userRef = db.collection("users").doc(uid);
      tx.set(userRef, {
        rewardPoints: admin.firestore.FieldValue.increment(STREAK_10_RP),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Write reward history + notification outside transaction (after commit)
      // We schedule it via a promise we don't await inside the tx
    } else if (current >= 5 && !rewarded5) {
      // 5-win milestone (only if 10-win not also triggered this tick)
      tx.set(streakRef, { rewarded5: true }, { merge: true });
    }
  });

  // After transaction — check what milestones were just crossed and send notifications
  // Re-read the streak doc to see what changed
  const afterSnap = await streakRef.get();
  const after = afterSnap.exists ? (afterSnap.data() as any) : {};
  const current = Number(after.currentStreak ?? 0);

  if (result === "win" && current >= 10 && after.rewarded10 === true) {
    // Was this the exact crossing? Only notify when current is exactly 10 or a multiple of 10
    if (current % 10 === 0) {
      await db.collection("users").doc(uid).set(
        { rewardPoints: admin.firestore.FieldValue.increment(0) }, // no-op to ensure doc exists
        { merge: true }
      );
      await addRewardHistoryAndNotify(
        uid,
        "streak_bonus",
        STREAK_10_RP,
        `🔥 ${current}-pick win streak! Bonus reward.`,
        { streakLength: current, milestone: 10 },
      );
      // Also update notification to use streak_bonus type
      await createNotification({
        uid,
        type: "streak_bonus",
        title: `🔥 ${current} picks en racha!`,
        body: `¡Increíble! Lograste ${current} picks ganadores seguidos. +${STREAK_10_RP} RP bonus.`,
        dedupeKey: `streak_10_${uid}_${current}`,
        ctaUrl: "/dashboard",
        meta: { streakLength: current, rp: STREAK_10_RP },
      });
    }
  } else if (result === "win" && current >= 5 && current < 10 && after.rewarded5 === true) {
    if (current % 5 === 0) {
      await addRewardHistoryAndNotify(
        uid,
        "streak_bonus",
        STREAK_5_RP,
        `🔥 ${current}-pick win streak! Bonus reward.`,
        { streakLength: current, milestone: 5 },
      );
      await createNotification({
        uid,
        type: "streak_bonus",
        title: `🔥 ${current} picks en racha!`,
        body: `¡Bien hecho! Lograste ${current} picks ganadores seguidos. +${STREAK_5_RP} RP bonus.`,
        dedupeKey: `streak_5_${uid}_${current}`,
        ctaUrl: "/dashboard",
        meta: { streakLength: current, rp: STREAK_5_RP },
      });
      // Give the RP
      await db.collection("users").doc(uid).set(
        { rewardPoints: admin.firestore.FieldValue.increment(STREAK_5_RP), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  }
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
    if (line === null)
      return selection === "home" ? "Home Spread" : "Away Spread";
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

/**
 * Ensures a leaderboard entry exists for the user with 0 pts.
 * Called on tournament join so the user appears immediately on the leaderboard
 * even before any picks are resolved.
 */
async function ensureLeaderboardEntry(
  uid: string,
  sport: Sport,
  weekId: string,
) {
  try {
    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? (profileSnap.data() as any) : {};
    const username = profile?.username ?? profile?.displayName ?? null;

    const lbId = leaderboardDocId(weekId, sport);
    const entryId = leaderboardEntryDocId(weekId, sport, uid);
    const lbRef = db.collection("leaderboards").doc(lbId);
    const entryRef = db.collection("leaderboardsEntries").doc(entryId);

    await db.runTransaction(async (tx) => {
      const [lbSnap, entrySnap] = await Promise.all([
        tx.get(lbRef),
        tx.get(entryRef),
      ]);

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

      // Only create — never overwrite existing points
      if (!entrySnap.exists) {
        tx.set(entryRef, {
          uid,
          sport,
          weekId,
          ...(username ? { username, displayName: username } : {}),
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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else if (username && !entrySnap.data()?.username) {
        // Backfill username if missing
        tx.set(entryRef, { username, displayName: username }, { merge: true });
      }
    });
  } catch (e) {
    console.warn("[ensureLeaderboardEntry] failed silently:", e);
    // Non-fatal — user can still make picks
  }
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
    const key = String(book?.key ?? "").toLowerCase();
    if (key === "draftkings") score += 10;
    if (key === "fanduel") score += 8;
    if (key === "betmgm") score += 6;
    if (key === "williamhill_us") score += 5;
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
  return true; // ✅ siempre activo, el schedule ya controla la frecuencia
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

const NBA_ABBR_MAP: Record<string, string> = {
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
  // Odds API /scores — covers daysFrom=3, works 24/7 including after midnight
  const apiKey = ODDS_API_KEY.value();
  const { data } = await axios.get(
    "https://api.the-odds-api.com/v4/sports/basketball_nba/scores",
    { params: { apiKey, daysFrom: 3, dateFormat: "iso" }, timeout: 20000 },
  );

  const games: Array<any> = data ?? [];
  let updated = 0,
    skipped = 0,
    notFound = 0;

  for (const g of games) {
    const home = NBA_ABBR_MAP[String(g.home_team ?? "")] ?? null;
    const away = NBA_ABBR_MAP[String(g.away_team ?? "")] ?? null;
    if (!home || !away) {
      skipped++;
      continue;
    }

    const startAt = new Date(g.commence_time);
    if (isNaN(startAt.getTime())) {
      skipped++;
      continue;
    }

    const oddsEventId = String(g.id ?? "").trim();
    // Safety: don't mark final/inprogress if startTime is > 2h in the future
    const isFuture = startAt.getTime() > Date.now() + 2 * 3600 * 1000;
    const status = isFuture
      ? "scheduled"
      : g.completed
        ? "final"
        : g.scores && g.scores.length > 0
          ? "inprogress"
          : "scheduled";

    const homeScore =
      g.scores?.find((s: any) => s.name === g.home_team)?.score ?? null;
    const awayScore =
      g.scores?.find((s: any) => s.name === g.away_team)?.score ?? null;
    const hs = homeScore != null ? Number(homeScore) : null;
    const as_ = awayScore != null ? Number(awayScore) : null;

    let snap: FirebaseFirestore.DocumentSnapshot | null = null;

    if (oddsEventId) {
      let q = await db
        .collection("games")
        .where("sport", "==", "NBA")
        .where("oddsEventId", "==", oddsEventId)
        .limit(1)
        .get();
      if (!q.empty) snap = q.docs[0];
      if (!snap) {
        q = await db
          .collection("games")
          .where("sport", "==", "NBA")
          .where("gameId", "==", oddsEventId)
          .limit(1)
          .get();
        if (!q.empty) snap = q.docs[0];
      }
    }

    if (!snap) {
      const q = await db
        .collection("games")
        .where("sport", "==", "NBA")
        .where("homeTeam", "==", home)
        .where("awayTeam", "==", away)
        .limit(10)
        .get();
      if (!q.empty) {
        const cands = q.docs.filter((d) => {
          const gs = (d.data() as any)?.startTime?.toDate?.() ?? null;
          return (
            gs && Math.abs(gs.getTime() - startAt.getTime()) <= 36 * 3600 * 1000
          );
        });
        if (cands.length) {
          cands.sort((a, b) => {
            const at =
              (a.data() as any)?.startTime?.toDate?.()?.getTime?.() ?? 0;
            const bt =
              (b.data() as any)?.startTime?.toDate?.()?.getTime?.() ?? 0;
            return (
              Math.abs(at - startAt.getTime()) -
              Math.abs(bt - startAt.getTime())
            );
          });
          snap = cands[0];
        }
      }
    }

    if (!snap) {
      if (g.completed) {
        const weekId = getWeekId(startAt);
        const docRef = db
          .collection("games")
          .doc(`NBA_${weekId}_${oddsEventId}`);
        await docRef.set(
          {
            league: "NBA",
            sport: "NBA",
            weekId,
            gameId: oddsEventId,
            oddsEventId,
            homeTeam: home,
            awayTeam: away,
            startTime: admin.firestore.Timestamp.fromDate(startAt),
            status: "final",
            scoreHome: hs,
            scoreAway: as_,
            source: "oddsapi-scores",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        console.log(`[runNbaScoresSync] auto-created: ${away} @ ${home}`);
        updated++;
      } else {
        notFound++;
      }
      continue;
    }

    const existingStatus = String(
      (snap.data() as any)?.status ?? "",
    ).toLowerCase();
    if (existingStatus === "final" && status !== "final") {
      skipped++;
      continue;
    }

    await snap.ref.set(
      {
        status,
        scoreHome: hs,
        scoreAway: as_,
        ...(oddsEventId ? { oddsEventId, gameId: oddsEventId } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    console.log(
      `[runNbaScoresSync] [${status}] ${away} @ ${home} | ${as_}-${hs}`,
    );
    updated++;
  }

  console.log("[runNbaScoresSync] done", {
    total: games.length,
    updated,
    skipped,
    notFound,
  });
  return { total: games.length, updated, skipped, notFound };
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
    // Run at 8am, 11am, 2pm, 5pm PR — catches new games added throughout the day
    // Added 0 (midnight) and 1am runs so next-day games appear right after midnight PR
    schedule: "0 0,1,8,11,14,17 * * *",
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
    // Every hour from 1am to midnight PR (1am catches next-day lines after midnight sync)
    schedule: "0 1,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *",
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
    schedule: "*/20 * * * *",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
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
  return true; // ✅ siempre activo, el schedule ya controla la frecuencia
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
  const home = String(args.home ?? "")
    .toUpperCase()
    .trim();
  const away = String(args.away ?? "")
    .toUpperCase()
    .trim();
  const startAt = args.startAt;
  const mlbGamePk = String(args.mlbGamePk ?? "").trim();

  if (!home || !away) return null;
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime()))
    return null;

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
    return (
      Math.abs(aStart - startAt.getTime()) -
      Math.abs(bStart - startAt.getTime())
    );
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
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime()))
    return null;

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
    db
      .collection("games")
      .where("sport", "==", "MLB")
      .where("status", "==", "scheduled")
      .get(),
    db
      .collection("games")
      .where("sport", "==", "MLB")
      .where("status", "==", "inprogress")
      .get(),
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

    const home = String(game?.homeTeam ?? "")
      .toUpperCase()
      .trim();
    const away = String(game?.awayTeam ?? "")
      .toUpperCase()
      .trim();
    const storedPk = String(game?.mlbGamePk ?? "").trim();

    let apiMatch =
      snapshots.find(
        (g) => storedPk && String(g?.mlbGamePk ?? "") === storedPk,
      ) ?? null;

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
          return (
            Math.abs(aStart - startAt.getTime()) -
            Math.abs(bStart - startAt.getTime())
          );
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
        elapsedMs >= 8 * 60 * 60 * 1000
          ? "stale-scheduled-over-8h"
          : "past-start-over-15m";
      await doc.ref.set(payload, { merge: true });
      forcedLive++;
      continue;
    }

    const hasNoScores = game?.scoreHome == null && game?.scoreAway == null;
    if (currentStatus === "inprogress" && elapsedMs >= 6 * 60 * 60 * 1000) {
      payload.needsScoreReview = true;
      payload.fallbackReason = hasNoScores
        ? "stale-inprogress-needs-review-no-score"
        : "stale-inprogress-needs-review";
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
  // Uses Odds API /scores — consistent with NBA, works 24/7, daysFrom=3
  const apiKey = ODDS_API_KEY.value();
  const { data } = await axios.get(
    "https://api.the-odds-api.com/v4/sports/baseball_mlb/scores",
    { params: { apiKey, daysFrom: 3, dateFormat: "iso" }, timeout: 20000 },
  );

  const games: Array<any> = data ?? [];
  let updated = 0,
    skipped = 0,
    notFound = 0;

  for (const g of games) {
    const home = mlbAbbr(g.home_team);
    const away = mlbAbbr(g.away_team);
    if (!home || !away) {
      console.log("[runMlbScoresSync] no map:", g.away_team, "@", g.home_team);
      skipped++;
      continue;
    }

    const startAt = new Date(g.commence_time);
    if (isNaN(startAt.getTime())) {
      skipped++;
      continue;
    }

    const oddsEventId = String(g.id ?? "").trim();
    // Safety: don't mark final/inprogress if startTime is > 2h in the future
    const isFuture = startAt.getTime() > Date.now() + 2 * 3600 * 1000;
    const status = isFuture
      ? "scheduled"
      : g.completed
        ? "final"
        : g.scores && g.scores.length > 0
          ? "inprogress"
          : "scheduled";

    const homeScoreRaw =
      g.scores?.find((s: any) => s.name === g.home_team)?.score ?? null;
    const awayScoreRaw =
      g.scores?.find((s: any) => s.name === g.away_team)?.score ?? null;
    const homeScore = homeScoreRaw != null ? Number(homeScoreRaw) : null;
    const awayScore = awayScoreRaw != null ? Number(awayScoreRaw) : null;

    // Multi-fallback lookup: oddsEventId → gameId → matchKey → team+time
    let snap: FirebaseFirestore.DocumentSnapshot | null = null;

    if (oddsEventId) {
      let q = await db
        .collection("games")
        .where("sport", "==", "MLB")
        .where("oddsEventId", "==", oddsEventId)
        .limit(1)
        .get();
      if (!q.empty) snap = q.docs[0];

      if (!snap) {
        q = await db
          .collection("games")
          .where("sport", "==", "MLB")
          .where("gameId", "==", oddsEventId)
          .limit(1)
          .get();
        if (!q.empty) snap = q.docs[0];
      }
    }

    if (!snap) {
      const dateKey = `${startAt.getFullYear()}${String(startAt.getMonth() + 1).padStart(2, "0")}${String(startAt.getDate()).padStart(2, "0")}`;
      const matchKey = `MLB_${dateKey}_${home}_${away}`;
      const q = await db
        .collection("games")
        .where("matchKey", "==", matchKey)
        .limit(1)
        .get();
      if (!q.empty) snap = q.docs[0];
    }

    if (!snap) {
      const q = await db
        .collection("games")
        .where("sport", "==", "MLB")
        .where("homeTeam", "==", home)
        .where("awayTeam", "==", away)
        .limit(10)
        .get();
      if (!q.empty) {
        const cands = q.docs.filter((d) => {
          const gs = (d.data() as any)?.startTime?.toDate?.() ?? null;
          return (
            gs && Math.abs(gs.getTime() - startAt.getTime()) <= 36 * 3600 * 1000
          );
        });
        if (cands.length) {
          cands.sort((a, b) => {
            const at =
              (a.data() as any)?.startTime?.toDate?.()?.getTime?.() ?? 0;
            const bt =
              (b.data() as any)?.startTime?.toDate?.()?.getTime?.() ?? 0;
            return (
              Math.abs(at - startAt.getTime()) -
              Math.abs(bt - startAt.getTime())
            );
          });
          snap = cands[0];
        }
      }
    }

    if (!snap) {
      if (g.completed) {
        const weekId = getWeekId(startAt);
        const docRef = db
          .collection("games")
          .doc(`MLB_${weekId}_${oddsEventId}`);
        await docRef.set(
          {
            league: "MLB",
            sport: "MLB",
            weekId,
            gameId: oddsEventId,
            oddsEventId,
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
        console.log(`[runMlbScoresSync] auto-created: ${away} @ ${home}`);
        updated++;
      } else {
        notFound++;
      }
      continue;
    }

    const existingStatus = String(
      (snap.data() as any)?.status ?? "",
    ).toLowerCase();
    if (existingStatus === "final" && status !== "final") {
      skipped++;
      continue;
    }

    await snap.ref.set(
      {
        status,
        scoreHome: homeScore,
        scoreAway: awayScore,
        ...(oddsEventId ? { oddsEventId, gameId: oddsEventId } : {}),
        needsScoreReview: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    console.log(
      `[runMlbScoresSync] [${status}] ${away} @ ${home} | ${awayScore}-${homeScore}`,
    );
    updated++;
  }

  // Still run fallback for any remaining stuck games
  await runMlbStatusFallbackSync();

  console.log("[runMlbScoresSync] done", {
    total: games.length,
    updated,
    skipped,
    notFound,
  });
  return { total: games.length, updated, skipped, notFound };
}

async function findExistingMlbGameDoc(args: {
  oddsEventId?: string;
  matchKey?: string;
  legacyMatchKey?: string;
}) {
  const oddsEventId = String(args.oddsEventId ?? "").trim();
  const matchKey = String(args.matchKey ?? "").trim();
  const legacyMatchKey = String(args.legacyMatchKey ?? "").trim();

  // 1) por oddsEventId exacto
  if (oddsEventId) {
    let q = await db
      .collection("games")
      .where("sport", "==", "MLB")
      .where("oddsEventId", "==", oddsEventId)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];

    // también como gameId (por si fue creado con gameId = oddsEventId)
    q = await db
      .collection("games")
      .where("sport", "==", "MLB")
      .where("gameId", "==", oddsEventId)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];
  }

  // 2) por matchKey (MLB_YYYYMMDD_HOME_AWAY)
  if (matchKey) {
    const q = await db
      .collection("games")
      .where("sport", "==", "MLB")
      .where("matchKey", "==", matchKey)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];
  }

  // 3) por legacyMatchKey (mismo formato, por docs viejos)
  if (legacyMatchKey && legacyMatchKey !== matchKey) {
    const q = await db
      .collection("games")
      .where("sport", "==", "MLB")
      .where("matchKey", "==", legacyMatchKey)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];
  }

  return null;
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
  let migrated = 0;

  for (const ev of data as Array<any>) {
    const home = mlbAbbr(ev.home_team);
    const away = mlbAbbr(ev.away_team);
    if (!home || !away) {
      skipped++;
      console.log(
        "[runMlbEventsSync] no map:",
        ev.away_team,
        "@",
        ev.home_team,
      );
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

    const dateKey = yyyymmddFromIso(ev.commence_time);
    // matchKey igual al patrón MLB_YYYYMMDD_HOME_AWAY (para scores sync)
    const matchKey = `MLB_${dateKey}_${home}_${away}`;

    const weekId = getWeekId(commence);
    // ✅ Igual que NBA: gameId = oddsEventId puro, docId = MLB_weekId_oddsEventId
    const gameId = oddsEventId;
    const docId = gameDocId("MLB", weekId, gameId);

    // Busca doc existente (puede tener docId distinto si fue creado con formato viejo)
    const existing =
      (await findExistingMlbGameDoc({ oddsEventId, matchKey })) ?? null;
    const targetRef = existing?.ref ?? db.collection("games").doc(docId);

    if (existing && existing.id !== docId) {
      migrated++;
      console.log(`[runMlbEventsSync] migrating ${existing.id} → ${docId}`);
    }

    const existingData = existing?.exists ? (existing.data() as any) : null;
    const existingStatus = String(existingData?.status ?? "").toLowerCase();

    await targetRef.set(
      {
        league: "MLB",
        sport: "MLB",
        weekId,
        gameId, // = oddsEventId (mismo patrón que NBA)
        matchKey,
        oddsEventId,
        homeTeam: home,
        awayTeam: away,
        startTime: admin.firestore.Timestamp.fromDate(commence),
        status:
          existingStatus === "inprogress" || existingStatus === "final"
            ? existingStatus
            : "scheduled",
        scoreHome:
          existingStatus === "inprogress" || existingStatus === "final"
            ? typeof existingData?.scoreHome === "number"
              ? existingData.scoreHome
              : null
            : null,
        scoreAway:
          existingStatus === "inprogress" || existingStatus === "final"
            ? typeof existingData?.scoreAway === "number"
              ? existingData.scoreAway
              : null
            : null,
        mlbGamePk: existingData?.mlbGamePk ?? null,
        source: "oddsapi",
        createdAt: existingData?.createdAt ?? nowTs(),
        updatedAt: nowTs(),
      },
      { merge: true },
    );

    upserted++;
  }

  console.log("[runMlbEventsSync] done", { upserted, skipped, migrated });
  return { upserted, skipped, migrated };
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
      regions: "us,us2",
      markets: "h2h,spreads,totals",
      oddsFormat: "american",
      dateFormat: "iso",
      bookmakers: "draftkings,fanduel,betmgm,williamhill_us",
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

    const oddsEventId = String(ev.id ?? "").trim();
    if (!oddsEventId) {
      skipped++;
      continue;
    }

    const dateKey = yyyymmddFromIso(ev.commence_time);
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
      oddsEventId,
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

    // ✅ Igual que NBA: busca por oddsEventId / matchKey
    const docSnap = await findExistingMlbGameDoc({ oddsEventId, matchKey });

    if (!docSnap) {
      skipped++;
      console.log(
        `[runMlbOddsSync] no-match: ${away} @ ${home} | oddsEventId: ${oddsEventId}`,
      );
      continue;
    }

    const game = docSnap.data() as any;
    const status = String(game?.status ?? "").toLowerCase();

    if (status === "final") {
      skipped++;
      continue;
    }

    // Si está inprogress y YA tiene líneas, no sobreescribir
    const hasLines =
      game?.markets?.moneyline != null ||
      game?.markets?.spread != null ||
      game?.markets?.total != null;

    if (status === "inprogress" && hasLines) {
      skipped++;
      continue;
    }

    await docSnap.ref.set(payload, { merge: true });
    updated++;
    console.log(
      `[runMlbOddsSync] updated: ${away} @ ${home} | ML:${awayML}/${homeML} SP:${awaySP?.point ?? "—"}/${homeSP?.point ?? "—"} OU:${overTOT?.point ?? "—"}`,
    );
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
    // Run at 8:30am, 11:30am, 2:30pm, 5:30pm PR — same as NBA events
    // Added 0:30am and 1:30am runs so next-day games appear right after midnight PR
    schedule: "30 0,1,8,11,14,17 * * *",
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
    schedule: "0 1,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
  },
  async () => {
    await runMlbOddsSync();
  },
);

export const syncMlbScores = onSchedule(
  {
    schedule: "*/20 * * * *",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
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
    if (sportStr !== "NBA" && sportStr !== "MLB" && sportStr !== "SOCCER")
      return;

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
  if (sportStr !== "NBA" && sportStr !== "MLB" && sportStr !== "SOCCER") return;

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

  // ✅ FIX: también actualizar la subcolección que lee finalizeWeekly
  const userSubRef = lbRef.collection("users").doc(uid);
  tx.set(userSubRef, payload, { merge: true });
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

  // MONEYLINE (Soccer supports "draw" as third option)
  if (market === "moneyline") {
    if (selection === "draw") {
      return homeScore === awayScore ? "win" : "loss";
    }
    if (homeScore === awayScore) return "loss"; // picked home/away but it drew
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

const POINTS_DRAW_SOCCER = 200; // Soccer draw correct pick awards extra points

function pointsForResult(
  result: Exclude<PickResult, "pending">,
  extra?: { sport?: string; selection?: string },
) {
  // Soccer draw correct pick = 200 pts (harder to predict)
  if (
    result === "win" &&
    String(extra?.sport ?? "").toUpperCase() === "SOCCER" &&
    String(extra?.selection ?? "").toLowerCase() === "draw"
  ) {
    return POINTS_DRAW_SOCCER;
  }
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
    if (sportStr !== "NBA" && sportStr !== "MLB" && sportStr !== "SOCCER") return;
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

      // ── Streak update ──────────────────────────────────────────────────
      await checkAndRewardStreak(item.uid, item.result as PickResult);

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

/** ===== (4b) Resolve DAILY picks when game becomes FINAL ===== *
  "games/{docId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const game = after.data() as any;

    const sportStr = String(game.sport ?? game.league ?? "NBA").toUpperCase();
    if (sportStr !== "NBA" && sportStr !== "MLB" && sportStr !== "SOCCER") return;
    const sport = sportStr as Sport;

    const status = String(game.status ?? "").toLowerCase();
    if (status !== "final") return;

    const gameId = String(game.gameId ?? "");
    if (!gameId) return;

    // Query picks_daily by sport + gameId
    // Also try by gameDocId in case the pick was stored with the Firestore doc ID
    const gameDocId = event.params?.docId ?? "";

    let picksSnap = await db
      .collection("picks_daily")
      .where("sport", "==", sport)
      .where("gameId", "==", gameId)
      .where("result", "==", "pending")
      .get();

    // Fallback: search by gameDocId (Firestore document ID of the game)
    if (picksSnap.empty && gameDocId) {
      picksSnap = await db
        .collection("picks_daily")
        .where("sport", "==", sport)
        .where("gameDocId", "==", gameDocId)
        .where("result", "==", "pending")
        .get();
    }

    // Fallback 2: search by the game's oddsEventId
    const oddsEventId = String(game?.oddsEventId ?? "").trim();
    if (picksSnap.empty && oddsEventId && oddsEventId !== gameId) {
      picksSnap = await db
        .collection("picks_daily")
        .where("sport", "==", sport)
        .where("gameId", "==", oddsEventId)
        .where("result", "==", "pending")
        .get();
    }

    if (picksSnap.empty) return;

    const notificationsToSend: Array<{
      uid: string;
      result: Exclude<PickResult, "pending">;
      points: number;
      pick: any;
      dayId: string;
    }> = [];

    await db.runTransaction(async (tx) => {
      for (const docSnap of picksSnap.docs) {
        const pick = docSnap.data() as any;

        const result = computePickResult(game, pick);
        const points = pointsForResult(result, {
          sport: String(pick.sport ?? game.sport ?? ""),
          selection: String(pick.selection ?? pick.pick ?? ""),
        });

        const alreadyCorrect =
          pick.result === result && pick.pointsAwarded === points;
        if (alreadyCorrect) continue;

        const wasPending = String(pick.result ?? "pending") === "pending";

        tx.set(
          docSnap.ref,
          {
            result,
            pointsAwarded: points,
            lbId: String(pick.dayId ?? ""), // use dayId as lbId for daily
            lbEnsured: true,
            leaderboardApplied: wasPending
              ? true
              : (pick.leaderboardApplied ?? false),
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        if (wasPending) {
          notificationsToSend.push({
            uid: String(pick.uid ?? "").trim(),
            result,
            points,
            pick,
            dayId: String(pick.dayId ?? ""),
          });
        }
      }
    });

    // Send notifications (same as weekly)
    for (const item of notificationsToSend) {
      if (!item.uid) continue;

      // ── Streak update ──────────────────────────────────────────────────
      await checkAndRewardStreak(item.uid, item.result as PickResult);

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
          ? "You won your daily pick"
          : item.result === "loss"
            ? "Daily pick settled"
            : "Your daily pick pushed";

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
        dedupeKey: `daily_${item.dayId}_${gameId}_${item.pick?.market ?? "market"}`,
        ctaUrl: "/my-picks",
        meta: {
          sport,
          dayId: item.dayId,
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

/** ===== Tiebreaker helper =====
 * Sort leaderboard entries by:
 *   1. points desc
 *   2. win rate desc  (wins / (wins + losses), ignoring pushes)
 *   3. total picks desc (wins + losses + pushes)
 * Returns sorted array. Entries that tie on ALL three criteria share the #1 prize.
 */
function resolveWinners(docs: FirebaseFirestore.QueryDocumentSnapshot[]): {
  sorted: FirebaseFirestore.QueryDocumentSnapshot[];
  firstPlaceUids: Set<string>;
} {
  const withStats = docs.map((d) => {
    const data = d.data() as any;
    const wins = Number(data.wins ?? 0);
    const losses = Number(data.losses ?? 0);
    const pushes = Number(data.pushes ?? 0);
    const points = Number(data.points ?? 0);
    const totalPicks = wins + losses + pushes;
    const winRate = totalPicks > 0 ? wins / totalPicks : 0;
    return { doc: d, points, winRate, totalPicks };
  });

  withStats.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.totalPicks - a.totalPicks;
  });

  // All entries that tie with the #1 on points AND winRate share the winner prize
  const first = withStats[0];
  const firstPlaceUids = new Set(
    withStats
      .filter(
        (e) =>
          e.points === first.points &&
          e.winRate === first.winRate &&
          e.totalPicks === first.totalPicks,
      )
      .map((e) => e.doc.id),
  );

  return { sorted: withStats.map((e) => e.doc), firstPlaceUids };
}

/** ===== (5) Finalize NBA leaderboard weekly (Mon 12:05am PR) ===== */
export const finalizeWeeklyLeaderboardNBA = onSchedule(
  { schedule: "5 0 * * 0", timeZone: "America/Puerto_Rico" },
  async () => {
    const sport: Sport = "NBA";

    // Monday 12:05am -> finalize the week that ended Sunday
    const prNow = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
    );
    prNow.setDate(prNow.getDate() - 1); // go to Sunday PR
    const weekId = getWeekId(prNow);

    const lbId = leaderboardDocId(weekId, sport);
    const lbRef = db.collection("leaderboards").doc(lbId);

    const lbSnap = await lbRef.get();
    if (lbSnap.exists && (lbSnap.data() as any)?.finalized === true) return;

    const topSnap = await db
      .collection("leaderboardsEntries")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
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

    // Apply tiebreaker: points → win rate → total picks
    const { sorted: sortedDocs, firstPlaceUids } = resolveWinners(topSnap.docs);
    const winners = sortedDocs.map((d) => ({
      uid: d.id,
      ...(d.data() as any),
    }));

    // =========================
    // REWARD POINTS (STORE)
    // =========================

    // TOP 10 leaderboard
    const top10Snap = await db
      .collection("leaderboardsEntries")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
      .orderBy("points", "desc")
      .limit(10)
      .get();

    for (const doc of top10Snap.docs) {
      const uid = (doc.data() as any).uid ?? doc.id;
      const data = doc.data() as any;
      const rank = top10Snap.docs.indexOf(doc) + 1;

      const wins = Number(data.wins ?? 0);
      const pushes = Number(data.pushes ?? 0);

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const userData = userSnap.data() as any;

      const plan = String(userData?.plan ?? "free").toLowerCase();
      const isPrem = plan === "premium";

      let rp = 0;

      if (isPrem) {
        rp += wins * 10;
        rp += pushes * 3;
      } else {
        rp += wins * 3;
        rp += pushes * 1;
      }

      // Top 10 bonus (FREE: +10, PREMIUM: +50)
      rp += isPrem ? 50 : 10;

      // Placement bonuses
      if (isPrem) {
        if (rank === 1) rp += 500; // #1 PREMIUM
        else if (rank === 2) rp += 200; // #2 PREMIUM
        else if (rank === 3) rp += 100; // #3 PREMIUM
      } else {
        if (firstPlaceUids.has(doc.id)) rp += 100; // #1 FREE (unchanged)
      }

      await userRef.set(
        {
          rewardPoints: admin.firestore.FieldValue.increment(rp),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (rp > 0) {
        const rankLabel = rank === 1 ? " 🏆 #1" : rank === 2 ? " 🥈 #2" : rank === 3 ? " 🥉 #3" : ` Top ${rank}`;
        await addRewardHistoryAndNotify(
          uid,
          "leaderboard_reward",
          rp,
          `Weekly leaderboard reward — NBA ${weekId}${rankLabel}`,
          {
            weekId,
            sport: "NBA",
            wins,
            pushes,
            plan,
            rank,
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

export const adminRecomputeSOCCERWeek = onCall({ cors: true }, async (req) => {
  const weekId = String(req.data?.weekId ?? "").trim();
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    throw new HttpsError(
      "invalid-argument",
      'WeekId inválido. Usa formato "2026-W12".',
    );
  }

  return await recomputeWeekForSport({ weekId, sport: "SOCCER" });
});

export const adminFinalizeWeeklyRewards = onCall(
  { cors: true },
  async (req) => {
    await requireAdmin(req);

    const sportRaw = String(req.data?.sport ?? "NBA").toUpperCase();
    if (sportRaw !== "NBA" && sportRaw !== "MLB" && sportRaw !== "SOCCER") {
  throw new HttpsError("invalid-argument", "sport debe ser NBA, MLB o SOCCER.");
}
    const sport = sportRaw as Sport;

    const weekId = String(req.data?.weekId ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(weekId)) {
      throw new HttpsError(
        "invalid-argument",
        'WeekId inválido. Usa formato "2026-W13".',
      );
    }

    // force: true permite correr aunque ya esté finalizado (para backfill)
    const force = req.data?.force === true;

    const lbId = leaderboardDocId(weekId, sport);
    const lbRef = db.collection("leaderboards").doc(lbId);

    const lbSnap = await lbRef.get();
    if (!force && lbSnap.exists && (lbSnap.data() as any)?.finalized === true) {
      return { ok: false, reason: "already-finalized", weekId, sport };
    }

    // ✅ Lee de leaderboardsEntries (donde sí están los puntos)
    const topSnap = await db
      .collection("leaderboardsEntries")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
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
      return { ok: true, reason: "no-entries", rewarded: 0, weekId, sport };
    }

    // Apply tiebreaker: points → win rate → total picks
    const { sorted: sortedDocsAdmin, firstPlaceUids: firstPlaceUidsAdmin } = resolveWinners(topSnap.docs);
    const winners = sortedDocsAdmin.map((d) => ({
      uid: (d.data() as any).uid ?? d.id,
      ...(d.data() as any),
    }));

    // Top 10
    const top10Snap = await db
      .collection("leaderboardsEntries")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
      .orderBy("points", "desc")
      .limit(10)
      .get();

    let rewarded = 0;

    for (const doc of top10Snap.docs) {
      const data = doc.data() as any;
      const uid = String(data.uid ?? doc.id).trim();
      if (!uid) continue;

      const wins = Number(data.wins ?? 0);
      const pushes = Number(data.pushes ?? 0);

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const userData = userSnap.exists ? (userSnap.data() as any) : {};
      const plan = String(userData?.plan ?? "free").toLowerCase();

      let rp = 0;

      // ✅ Valores actualizados: free 3/1, premium 10/3
      if (plan === "premium") {
        rp += wins * 10;
        rp += pushes * 3;
      } else {
        rp += wins * 3;
        rp += pushes * 1;
      }

      // Bonus top 10 (FREE: +10, PREMIUM: +50)
      const isPrem = plan === "premium";
      rp += isPrem ? 50 : 10;

      // Placement bonuses
      const rank = top10Snap.docs.indexOf(doc) + 1;
      if (isPrem) {
        if (rank === 1) rp += 500;
        else if (rank === 2) rp += 200;
        else if (rank === 3) rp += 100;
      } else {
        if (firstPlaceUidsAdmin.has(doc.id)) rp += 100;
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
          `Weekly leaderboard reward — ${sport} ${weekId}`,
          { weekId, sport, wins, pushes, plan },
        );
      }

      rewarded++;
    }

    // Marcar como finalizado
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

    return { ok: true, weekId, sport, rewarded, winners: winners.length };
  },
);

// =============================================================================
// SOCCER SYNC — Weekly tournament (all leagues combined into one)
// Leagues: EPL, La Liga, Bundesliga, Serie A, Ligue 1, Champions League
// sport: "SOCCER", league field: stores the specific league key
// gameId: oddsEventId (pure UUID from Odds API)
// =============================================================================

const SOCCER_LEAGUE_MAP: Record<string, string> = {
  soccer_epl: "EPL",
  soccer_spain_la_liga: "La Liga",
  soccer_germany_bundesliga: "Bundesliga",
  soccer_italy_serie_a: "Serie A",
  soccer_france_ligue_1: "Ligue 1",
  soccer_uefa_champs_league: "Champions League",
};

const SOCCER_SPORT_KEYS = Object.keys(SOCCER_LEAGUE_MAP);

async function runSoccerEventsSync() {
  const apiKey = ODDS_API_KEY.value();
  let upserted = 0,
    skipped = 0;

  for (const sportKey of SOCCER_SPORT_KEYS) {
    const leagueLabel = SOCCER_LEAGUE_MAP[sportKey];

    let data: any[];
    try {
      const res = await axios.get(
        `https://api.the-odds-api.com/v4/sports/${sportKey}/events`,
        { params: { apiKey, dateFormat: "iso" }, timeout: 20000 },
      );
      data = res.data as any[];
    } catch (e: any) {
      console.warn(`[runSoccerEventsSync] skipping ${sportKey}: ${e?.message}`);
      continue;
    }

    for (const ev of data) {
      const oddsEventId = String(ev.id ?? "").trim();
      const home = String(ev.home_team ?? "").trim();
      const away = String(ev.away_team ?? "").trim();
      if (!oddsEventId || !home || !away) {
        skipped++;
        continue;
      }

      const commence = new Date(ev.commence_time);
      if (isNaN(commence.getTime())) {
        skipped++;
        continue;
      }

      const weekId = getWeekId(commence);
      const gameId = oddsEventId;
      const docId = `SOCCER_${weekId}_${gameId}`;

      const existing = await db
        .collection("games")
        .where("sport", "==", "SOCCER")
        .where("oddsEventId", "==", oddsEventId)
        .limit(1)
        .get();

      const existingData = existing.empty
        ? null
        : (existing.docs[0].data() as any);
      const existingStatus = String(existingData?.status ?? "").toLowerCase();
      const targetRef = existing.empty
        ? db.collection("games").doc(docId)
        : existing.docs[0].ref;

      await targetRef.set(
        {
          sport: "SOCCER",
          league: leagueLabel,
          sportKey,
          weekId,
          gameId,
          oddsEventId,
          homeTeam: home,
          awayTeam: away,
          startTime: admin.firestore.Timestamp.fromDate(commence),
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
      `[runSoccerEventsSync] ${sportKey}: ${data?.length ?? 0} events`,
    );
  }

  console.log("[runSoccerEventsSync] done", { upserted, skipped });
  return { upserted, skipped };
}

async function runSoccerOddsSync(opts?: { force?: boolean }) {
  const apiKey = ODDS_API_KEY.value();
  let updated = 0,
    skipped = 0;

  for (const sportKey of SOCCER_SPORT_KEYS) {
    let data: any[];
    try {
      const res = await axios.get(
        `https://api.the-odds-api.com/v4/sports/${sportKey}/odds`,
        {
          params: {
            apiKey,
            regions: "us,eu",
            markets: "h2h,spreads,totals",
            oddsFormat: "american",
            dateFormat: "iso",
            bookmakers: "draftkings,fanduel,betmgm,bet365,williamhill_us",
          },
          timeout: 20000,
        },
      );
      data = res.data as any[];
    } catch (e: any) {
      console.warn(`[runSoccerOddsSync] skipping ${sportKey}: ${e?.message}`);
      continue;
    }

    const BOOKIE_PRIO = [
      "draftkings",
      "fanduel",
      "betmgm",
      "bet365",
      "williamhill_us",
      "betonlineag",
    ];

    for (const ev of data) {
      const oddsEventId = String(ev.id ?? "").trim();
      if (!oddsEventId) continue;

      const snap = await db
        .collection("games")
        .where("sport", "==", "SOCCER")
        .where("oddsEventId", "==", oddsEventId)
        .limit(1)
        .get();
      if (snap.empty) {
        skipped++;
        continue;
      }

      const gameDoc = snap.docs[0];
      const game = gameDoc.data() as any;
      if (String(game?.status ?? "").toLowerCase() === "final") {
        skipped++;
        continue;
      }

      // Find best bookmaker for each market
      const findMarket = (key: string) => {
        for (const bk of BOOKIE_PRIO) {
          const b = (ev.bookmakers || []).find((x: any) => x.key === bk);
          if (!b) continue;
          const m = (b.markets || []).find((x: any) => x.key === key);
          if (m?.outcomes?.length) return m;
        }
        return null;
      };

      const h2h = findMarket("h2h");
      const spreads = findMarket("spreads");
      const totals = findMarket("totals");

      const markets: any = {};

      // Soccer h2h: Home / Draw / Away (3-way)
      if (h2h?.outcomes?.length) {
        const homeO = h2h.outcomes.find((o: any) => o.name === ev.home_team);
        const awayO = h2h.outcomes.find((o: any) => o.name === ev.away_team);
        const drawO = h2h.outcomes.find(
          (o: any) =>
            String(o.name).toLowerCase().includes("draw") || o.name === "Draw",
        );
        markets.moneyline = {
          home: homeO?.price ?? null,
          away: awayO?.price ?? null,
          draw: drawO?.price ?? null,
        };
      }

      if (spreads?.outcomes?.length) {
        const homeO = spreads.outcomes.find(
          (o: any) => o.name === ev.home_team,
        );
        const awayO = spreads.outcomes.find(
          (o: any) => o.name === ev.away_team,
        );
        markets.spread = {
          homeLine: homeO?.point ?? null,
          awayLine: awayO?.point ?? null,
        };
      }

      if (totals?.outcomes?.length) {
        const overO = totals.outcomes.find(
          (o: any) => String(o.name).toLowerCase() === "over",
        );
        const line =
          overO?.point ??
          totals.outcomes.find((o: any) => typeof o.point === "number")
            ?.point ??
          null;
        if (line !== null) markets.total = { line };
      }

      if (Object.keys(markets).length === 0) {
        skipped++;
        continue;
      }

      await gameDoc.ref.set(
        {
          markets,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      updated++;
    }
  }

  console.log("[runSoccerOddsSync] done", { updated, skipped });
  return { updated, skipped };
}

async function runSoccerScoresSync() {
  const apiKey = ODDS_API_KEY.value();
  let updated = 0,
    skipped = 0;

  for (const sportKey of SOCCER_SPORT_KEYS) {
    let data: any[];
    try {
      const res = await axios.get(
        `https://api.the-odds-api.com/v4/sports/${sportKey}/scores`,
        { params: { apiKey, daysFrom: 3, dateFormat: "iso" }, timeout: 20000 },
      );
      data = res.data as any[];
    } catch (e: any) {
      console.warn(`[runSoccerScoresSync] skipping ${sportKey}: ${e?.message}`);
      continue;
    }

    for (const g of data) {
      const oddsEventId = String(g.id ?? "").trim();
      if (!oddsEventId) continue;

      const snap = await db
        .collection("games")
        .where("sport", "==", "SOCCER")
        .where("oddsEventId", "==", oddsEventId)
        .limit(1)
        .get();
      if (snap.empty) {
        skipped++;
        continue;
      }

      const startAtSoccer = new Date(g.commence_time);
      const isFutureSoccer =
        !isNaN(startAtSoccer.getTime()) &&
        startAtSoccer.getTime() > Date.now() + 2 * 3600 * 1000;
      const status = isFutureSoccer
        ? "scheduled"
        : g.completed
          ? "final"
          : g.scores && g.scores.length > 0
            ? "inprogress"
            : "scheduled";

      const homeScoreRaw =
        g.scores?.find((s: any) => s.name === g.home_team)?.score ?? null;
      const awayScoreRaw =
        g.scores?.find((s: any) => s.name === g.away_team)?.score ?? null;
      const homeScore = homeScoreRaw != null ? Number(homeScoreRaw) : null;
      const awayScore = awayScoreRaw != null ? Number(awayScoreRaw) : null;

      const existing = snap.docs[0].data() as any;
      if (
        String(existing?.status ?? "").toLowerCase() === "final" &&
        status !== "final"
      ) {
        skipped++;
        continue;
      }

      await snap.docs[0].ref.set(
        {
          status,
          scoreHome: homeScore,
          scoreAway: awayScore,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      updated++;
    }
  }

  console.log("[runSoccerScoresSync] done", { updated, skipped });
  return { updated, skipped };
}

// ── Admin: Sync Soccer Now ───────────────────────────────────────────────────
export const syncSoccerGamesNow = onCall(
  { cors: true, secrets: [ODDS_API_KEY] },
  async (req) => {
    await requireAdmin(req);
    const events = await runSoccerEventsSync();
    const odds = await runSoccerOddsSync({ force: true });
    const scores = await runSoccerScoresSync();
    return { ok: true, mode: "manual-soccer-sync", events, odds, scores };
  },
);

// ── Scheduled: Soccer Events 4x/day ─────────────────────────────────────────
export const syncSoccerEvents = onSchedule(
  // Added 0:15am and 1:15am runs so next-day soccer games appear after midnight PR
  {
    schedule: "15 0,1,8,11,14,17 * * *",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
  },
  async () => {
    await runSoccerEventsSync();
  },
);

// ── Scheduled: Soccer Odds hourly during game hours ─────────────────────────
export const syncSoccerOdds = onSchedule(
  {
    schedule: "30 1,9,10,11,12,13,14,15,16,17,18,19,20,21,22 * * *",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
  },
  async () => {
    await runSoccerOddsSync();
  },
);

// ── Scheduled: Soccer Scores every 10 min ───────────────────────────────────
export const syncSoccerScores = onSchedule(
  {
    schedule: "*/20 * * * *",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
  },
  async () => {
    await runSoccerScoresSync();
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// TOURNAMENT REGISTRATION SYSTEM
//
// Daily:  tournamentId = "{dayId}_{sport}"   e.g. "2026-04-08_MLB"
// Weekly: tournamentId = "{weekId}_{sport}"  e.g. "2026-W15_NBA"
//
// Firestore: tournament_registrations/{tournamentId}_{uid}
//   Fields: uid, tournamentId, sport, type ("daily"|"weekly"), dayId|weekId,
//           joinedAt, status ("active"|"closed")
//
// Registration closes when the FIRST game of the tournament starts.
// placeDailyPick and placePick check registration before accepting a pick.
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the earliest startTime among scheduled games for a tournament */
/** Check if a tournament is still open for registration.
 *
 * A tournament is CLOSED when:
 *   1. We found games AND the first game's startTime has passed, OR
 *   2. Any game is already inprogress or final (belt-and-suspenders check)
 *
 * A tournament is OPEN only when:
 *   - We found games AND now < firstGame.startTime
 *
 * If NO games are found (not synced yet) we return closed to be safe —
 * better to block a registration than allow a cheat.
 */
async function isTournamentOpen(args: {
  sport: Sport;
  weekId: string;
  dayId?: string;
}): Promise<{ open: boolean; reason?: string; firstGameAt?: Date }> {
  // ── TESTING MODE: Soccer registration always open ──
  if (args.sport === "SOCCER") {
    return { open: true };
  }

if (args.sport === "NBA") {
    return { open: true };
  }

if (args.sport === "MLB") {
    return { open: true };
  }


  // ── Use PR timezone for "now" — prevents UTC/PR midnight bug ──
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
  );

  // For DAILY tournaments: build a startTime range for that PR calendar day
  // This avoids fetching all week games and misreading past days as "started"
  let gamesQuery: FirebaseFirestore.Query = db
    .collection("games")
    .where("sport", "==", args.sport)
    .where("weekId", "==", args.weekId);

  let allGamesSnap = await gamesQuery.get();

  // For daily: if no games at all in the week yet → open (not synced)
  if (allGamesSnap.empty) {
    return args.dayId
      ? { open: true }
      : {
          open: false,
          reason:
            "No games found for this tournament. Registration is closed until games are synced.",
        };
  }

  let earliest: Date | null = null;
  let hasStartedGame = false;
  let dayGameCount = 0;

  for (const doc of allGamesSnap.docs) {
    const game = doc.data() as any;
    const st: Date | null = game?.startTime?.toDate?.() ?? null;
    if (!st) continue;

    // For daily: ONLY look at games on the specific dayId in PR timezone
    // Games from other days in the same week are completely ignored
    if (args.dayId) {
      const prDate = new Date(
        st.toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
      );
      const ymd = `${prDate.getFullYear()}-${String(prDate.getMonth() + 1).padStart(2, "0")}-${String(prDate.getDate()).padStart(2, "0")}`;
      if (ymd !== args.dayId) continue; // skip ALL processing for wrong-day games
      dayGameCount++;
    }

    // ── Only reaches here for games on the correct day ──
    // Mark as started if status is inprogress/final OR startTime passed in PR time
    const status = String(game?.status ?? "").toLowerCase();
    if (status === "inprogress" || status === "final") {
      hasStartedGame = true;
    } else {
      const stPR = new Date(
        st.toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
      );
      if (stPR <= now) hasStartedGame = true;
    }

    if (!earliest || st < earliest) earliest = st;
  }

  // Daily: no games for this specific day yet → open (will be synced at 8am)
  if (args.dayId && dayGameCount === 0) {
    return { open: true };
  }

  if (!earliest) {
    return args.dayId
      ? { open: true }
      : { open: false, reason: "No games found." };
  }

  if (hasStartedGame) {
    return {
      open: false,
      reason: "Tournament registration is closed — games have already started.",
      firstGameAt: earliest,
    };
  }

  return { open: true, firstGameAt: earliest };
}

// ── JOIN DAILY TOURNAMENT ────────────────────────────────────────────────────
export const joinDailyTournament = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const sportRaw = String(req.data?.sport ?? "").toUpperCase();
  if (sportRaw !== "NBA" && sportRaw !== "MLB") {
    throw new HttpsError("invalid-argument", "sport must be NBA or MLB.");
  }
  const sport = sportRaw as Sport;

  const dayIdIn = String(req.data?.dayId ?? "").trim();
  if (!dayIdIn || !/^\d{4}-\d{2}-\d{2}$/.test(dayIdIn)) {
    throw new HttpsError("invalid-argument", "dayId is required (YYYY-MM-DD).");
  }

  const weekIdIn = String(req.data?.weekId ?? "").trim();
  if (!weekIdIn)
    throw new HttpsError("invalid-argument", "weekId is required.");

  const tournamentId = `${dayIdIn}_${sport}`;
  const regDocId = `${tournamentId}_${uid}`;
  const regRef = db.collection("tournament_registrations").doc(regDocId);

  // Idempotent: if already registered, return success
  const existing = await regRef.get();
  if (existing.exists) {
    return { ok: true, alreadyJoined: true, tournamentId, regDocId };
  }

  // Check if tournament is still open
  const { open, reason } = await isTournamentOpen({
    sport,
    weekId: weekIdIn,
    dayId: dayIdIn,
  });
  if (!open) {
    throw new HttpsError(
      "failed-precondition",
      reason ?? "Tournament is closed.",
    );
  }

  await regRef.set({
    uid,
    tournamentId,
    sport,
    type: "daily",
    dayId: dayIdIn,
    weekId: weekIdIn,
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "active",
  });

  // Create leaderboard entry immediately so user appears on leaderboard with 0 pts
  await ensureLeaderboardEntry(uid, sport, weekIdIn);

  return { ok: true, alreadyJoined: false, tournamentId, regDocId };
});

// ── JOIN WEEKLY TOURNAMENT ───────────────────────────────────────────────────
export const joinWeeklyTournament = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const sportRaw = String(req.data?.sport ?? "").toUpperCase();
  if (sportRaw !== "NBA" && sportRaw !== "MLB" && sportRaw !== "SOCCER") {
    throw new HttpsError(
      "invalid-argument",
      "sport must be NBA, MLB, or SOCCER.",
    );
  }
  const sport = sportRaw as Sport;

  const weekIdIn = String(req.data?.weekId ?? "").trim();
  if (!weekIdIn)
    throw new HttpsError("invalid-argument", "weekId is required.");

  const tournamentId = `${weekIdIn}_${sport}`;
  const regDocId = `${tournamentId}_${uid}`;
  const regRef = db.collection("tournament_registrations").doc(regDocId);

  // Idempotent
  const existing = await regRef.get();
  if (existing.exists) {
    return { ok: true, alreadyJoined: true, tournamentId, regDocId };
  }

  // Weekly opens on Sunday — check it's still open (before first game of the week)
  const { open, reason } = await isTournamentOpen({ sport, weekId: weekIdIn });
  if (!open) {
    throw new HttpsError(
      "failed-precondition",
      reason ?? "Tournament registration is closed.",
    );
  }

  await regRef.set({
    uid,
    tournamentId,
    sport,
    type: "weekly",
    weekId: weekIdIn,
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "active",
  });

  // Create leaderboard entry immediately so user appears on leaderboard with 0 pts
  await ensureLeaderboardEntry(uid, sport, weekIdIn);

  return { ok: true, alreadyJoined: false, tournamentId, regDocId };
});

// ── CHECK TOURNAMENT REGISTRATION (used by frontend) ────────────────────────
export const getTournamentStatus = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const sportRaw = String(req.data?.sport ?? "").toUpperCase();
  const sport = sportRaw as Sport;
  const dayIdIn = String(req.data?.dayId ?? "").trim();
  const weekIdIn = String(req.data?.weekId ?? "").trim();
  const typeIn = String(req.data?.type ?? "daily").toLowerCase(); // "daily" | "weekly"

  const tournamentId =
    typeIn === "daily" ? `${dayIdIn}_${sport}` : `${weekIdIn}_${sport}`;

  const regDocId = `${tournamentId}_${uid}`;
  const regSnap = await db
    .collection("tournament_registrations")
    .doc(regDocId)
    .get();
  const isRegistered = regSnap.exists;

  const { open, firstGameAt } = await isTournamentOpen({
    sport,
    weekId: weekIdIn,
    dayId: typeIn === "daily" ? dayIdIn : undefined,
  });

  // For daily: check if ALL games for this specific day are already final
  // Frontend uses this to show "opens tomorrow" vs generic "closed"
  let allGamesFinished = false;
  if (typeIn === "daily" && dayIdIn && weekIdIn) {
    const weekSnap = await db
      .collection("games")
      .where("sport", "==", sport)
      .where("weekId", "==", weekIdIn)
      .get();
    const dayGames = weekSnap.docs.filter((doc) => {
      const st: Date | null =
        (doc.data() as any)?.startTime?.toDate?.() ?? null;
      if (!st) return false;
      const pr = new Date(
        st.toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
      );
      const ymd = `${pr.getFullYear()}-${String(pr.getMonth() + 1).padStart(2, "0")}-${String(pr.getDate()).padStart(2, "0")}`;
      return ymd === dayIdIn;
    });
    if (dayGames.length > 0) {
      allGamesFinished = dayGames.every(
        (doc) =>
          String((doc.data() as any)?.status ?? "").toLowerCase() === "final",
      );
    }
  }

  return {
    ok: true,
    tournamentId,
    isRegistered,
    isOpen: open,
    allGamesFinished,
    firstGameAt: firstGameAt?.toISOString() ?? null,
  };
});

export const claimDailyLoginReward = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const userRef = db.collection("users").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists ? (snap.data() as any) : {};

    const now = new Date();
    const last = data?.lastDailyRewardAt?.toDate?.() ?? null;

    const toPRDateStr = (d: Date) =>
      d.toLocaleDateString("en-US", { timeZone: "America/Puerto_Rico" });

    const sameUtcDay = last && toPRDateStr(last) === toPRDateStr(now);
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
    await addRewardHistoryAndNotify(
      uid,
      "daily_login",
      5,
      "Daily Login Reward",
    );
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

// ─────────────────────────────────────────────────────────────────────────────
// WELCOME BONUS — 25 RP una sola vez por usuario
// Se reclama cuando el usuario completa: cuenta + daily login + primer pick
// Guard: welcomeBonusClaimed: true en users/{uid} evita doble claim
// ─────────────────────────────────────────────────────────────────────────────
export const claimWelcomeBonus = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const WELCOME_RP = 25;
  const userRef = db.collection("users").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists ? (snap.data() as any) : {};

    // Guard: ya reclamó antes — respuesta idempotente sin error
    if (data?.welcomeBonusClaimed === true) {
      return { ok: true, claimed: false, reason: "already-claimed" };
    }

    // Verificar que tenga al menos 1 pick (protección server-side)
    const picksSnap = await db
      .collection("picks")
      .where("uid", "==", uid)
      .limit(1)
      .get();

    if (picksSnap.empty) {
      return { ok: false, claimed: false, reason: "no-picks-yet" };
    }

    tx.set(
      userRef,
      {
        rewardPoints: admin.firestore.FieldValue.increment(WELCOME_RP),
        welcomeBonusClaimed: true,
        welcomeBonusClaimedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { ok: true, claimed: true, awardedRP: WELCOME_RP };
  });

  if (result.claimed) {
    await addRewardHistoryAndNotify(
      uid,
      "welcome_bonus",
      WELCOME_RP,
      "Welcome Bonus — ¡Completaste los primeros pasos!",
      { welcomeBonus: true },
    );

    await createNotification({
      uid,
      type: "reward_points",
      title: "¡Bienvenido a Stat2Win! 🎉",
      body: `Completaste los primeros pasos y ganaste ${WELCOME_RP} RP de bienvenida.`,
      dedupeKey: `welcome_bonus_${uid}`,
      ctaUrl: "/store",
      meta: { rewardPoints: WELCOME_RP, welcomeBonus: true },
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
    const gamesSnap = await db
      .collection("games")
      .where("weekId", "==", weekId)
      .get();

    const upcomingGames = gamesSnap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
      .filter((game: any) => {
        const startAt = game?.startTime?.toDate?.() ?? null;
        const status = String(game?.status ?? "").toLowerCase();
        if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime()))
          return false;
        if (status === "inprogress" || status === "final") return false;
        const ts = startAt.getTime();
        return ts >= from && ts <= to;
      });

    if (!upcomingGames.length) {
      console.log("[sendPregameReminders] no upcoming games");
      return;
    }

    const picksSnap = await db
      .collection("picks")
      .where("weekId", "==", weekId)
      .get();
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

  if (sportRaw !== "NBA" && sportRaw !== "MLB" && sportRaw !== "SOCCER") {
    throw new HttpsError("invalid-argument", "Unsupported sport.");
  }

  const sport = sportRaw as "NBA" | "MLB" | "SOCCER";
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

    if (sportRaw !== "NBA" && sportRaw !== "MLB" && sportRaw !== "SOCCER") {
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
    const { data } = await axios.get(
      "https://statsapi.mlb.com/api/v1/schedule",
      {
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
      },
    );

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
    let apiMatch =
      apiSnapshots.find(
        (g) => storedPk && String(g?.mlbGamePk ?? "") === storedPk,
      ) ?? null;
    if (!apiMatch && startAt instanceof Date) {
      apiMatch =
        apiSnapshots.find(
          (g) =>
            String(g?.home ?? "").toUpperCase() ===
              String(game?.homeTeam ?? "").toUpperCase() &&
            String(g?.away ?? "").toUpperCase() ===
              String(game?.awayTeam ?? "").toUpperCase() &&
            g?.startAt instanceof Date &&
            Math.abs(g.startAt.getTime() - startAt.getTime()) <=
              36 * 60 * 60 * 1000,
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

// ================================================

export const adminRepairStaleNBAGames = onCall({ cors: true }, async (req) => {
  await requireAdmin(req);

  const weekId = String(req.data?.weekId ?? "").trim();
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    throw new HttpsError(
      "invalid-argument",
      'WeekId inválido. Usa formato "2026-W14".',
    );
  }

  // 1) Busca juegos NBA stuck en inprogress para esa semana
  const gamesSnap = await db
    .collection("games")
    .where("sport", "==", "NBA")
    .where("weekId", "==", weekId)
    .where("status", "==", "inprogress")
    .get();

  if (gamesSnap.empty) {
    return {
      ok: true,
      weekId,
      checked: 0,
      repaired: 0,
      reason: "no-stale-games",
    };
  }

  // 2) Uses Odds API /scores — same as runNbaScoresSync, works 24/7
  const repairApiKey = ODDS_API_KEY.value();
  const repairRes = await axios.get(
    "https://api.the-odds-api.com/v4/sports/basketball_nba/scores",
    {
      params: { apiKey: repairApiKey, daysFrom: 3, dateFormat: "iso" },
      timeout: 20000,
    },
  );
  const apiGames: Array<any> = repairRes.data ?? [];

  // Construimos un map home+away → resultado
  const apiMap = new Map<
    string,
    { status: string; scoreHome: number; scoreAway: number }
  >();
  for (const g of apiGames) {
    const home = NBA_ABBR_MAP[String(g?.home_team ?? "")] ?? null;
    const away = NBA_ABBR_MAP[String(g?.away_team ?? "")] ?? null;
    if (!home || !away) continue;
    const hs =
      g.scores?.find((s: any) => s.name === g.home_team)?.score ?? null;
    const as_ =
      g.scores?.find((s: any) => s.name === g.away_team)?.score ?? null;
    const status = g.completed
      ? "final"
      : g.scores?.length > 0
        ? "inprogress"
        : "scheduled";
    apiMap.set(`${home}_${away}`, {
      status,
      scoreHome: hs != null ? Number(hs) : 0,
      scoreAway: as_ != null ? Number(as_) : 0,
    });
  }

  let checked = 0;
  let repaired = 0;

  for (const doc of gamesSnap.docs) {
    checked++;
    const game = doc.data() as any;
    const home = String(game?.homeTeam ?? "")
      .toUpperCase()
      .trim();
    const away = String(game?.awayTeam ?? "")
      .toUpperCase()
      .trim();
    if (!home || !away) continue;

    const apiMatch = apiMap.get(`${home}_${away}`) ?? null;

    if (apiMatch?.status === "final") {
      await doc.ref.set(
        {
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
      continue;
    }

    // Si no está en el scoreboard de hoy, puede ser un juego de días anteriores
    // En ese caso marcamos needsScoreReview para revisión manual
    if (!apiMatch) {
      const startAt = game?.startTime?.toDate?.() ?? null;
      const elapsedMs =
        startAt instanceof Date ? Date.now() - startAt.getTime() : 0;

      // Si lleva más de 6 horas stuck en inprogress sin aparecer en la API → marcar para revisión
      if (elapsedMs >= 6 * 60 * 60 * 1000) {
        await doc.ref.set(
          {
            needsScoreReview: true,
            fallbackReason: "stale-nba-not-in-api-over-6h",
            fallbackStatusAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
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
    // Fetch final games + inprogress games stuck for > 5h (games that ended but status wasn't updated)
    const [finalSnap, inprogressSnap] = await Promise.all([
      db.collection("games").where("status", "==", "final").get(),
      db.collection("games").where("status", "==", "inprogress").get(),
    ]);

    const stuckCutoff = new Date(Date.now() - 5 * 3600 * 1000);
    const allDocs = [
      ...finalSnap.docs,
      ...inprogressSnap.docs.filter((d) => {
        const st = (d.data() as any)?.startTime?.toDate?.() ?? null;
        return st && st < stuckCutoff;
      }),
    ];

    if (allDocs.length === 0) {
      console.log("[autoRescoreFinalGames] no final/stuck games found");
      return;
    }

    let gamesChecked = 0;
    let picksUpdated = 0;

    for (const gameDoc of allDocs) {
      const game = gameDoc.data() as any;

      const sportStr = String(game.sport ?? game.league ?? "").toUpperCase();
      if (sportStr !== "NBA" && sportStr !== "MLB" && sportStr !== "SOCCER")
        continue;

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
        const points = pointsForResult(result, {
          sport: String(pick.sport ?? game.sport ?? ""),
          selection: String(pick.selection ?? pick.pick ?? ""),
        });

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

      // ── Always settle picks_daily for this game regardless of weekly picks ──
      // Uses gameId AND gameDocId as fallback to handle both NBA/MLB formats
      const dailyByGameId = db
        .collection("picks_daily")
        .where("sport", "==", sport)
        .where("gameId", "==", gameId)
        .where("result", "==", "pending");

      const dailyByDocId = db
        .collection("picks_daily")
        .where("sport", "==", sport)
        .where("gameDocId", "==", gameDoc.id)
        .where("result", "==", "pending");

      const [dailySnap1, dailySnap2] = await Promise.all([
        dailyByGameId.get(),
        dailyByDocId.get(),
      ]);

      // Merge results, dedupe by doc ID
      const seenIds = new Set<string>();
      const allDailyDocs = [...dailySnap1.docs, ...dailySnap2.docs].filter(
        (d) => {
          if (seenIds.has(d.id)) return false;
          seenIds.add(d.id);
          return true;
        },
      );

      // Also check by oddsEventId in case gameId was stored differently
      const oddsId = String(game?.oddsEventId ?? "").trim();
      if (oddsId && oddsId !== gameId) {
        const dailySnap3 = await db
          .collection("picks_daily")
          .where("sport", "==", sport)
          .where("gameId", "==", oddsId)
          .where("result", "==", "pending")
          .get();
        for (const d of dailySnap3.docs) {
          if (!seenIds.has(d.id)) {
            seenIds.add(d.id);
            allDailyDocs.push(d);
          }
        }
      }

      if (allDailyDocs.length > 0) {
        const dailyBatch = db.batch();
        let dailyUpdated = 0;
        for (const pickDoc of allDailyDocs) {
          const pick = pickDoc.data() as any;
          const result = computePickResult(game, pick);
          const points = pointsForResult(result);
          if (pick.result === result && pick.pointsAwarded === points) continue;
          dailyBatch.set(
            pickDoc.ref,
            {
              result,
              pointsAwarded: points,
              lbId: String(pick.dayId ?? ""),
              lbEnsured: true,
              leaderboardApplied: true,
              resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          dailyUpdated++;
        }
        if (dailyUpdated > 0) {
          await dailyBatch.commit();
          console.log(
            `[autoRescoreFinalGames] settled ${dailyUpdated} daily picks for ${sport} gameId=${gameId}`,
          );
        }
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
  const existingData = snap.exists ? (snap.data() as any) : null;

  // Derive username: prefer stored username, then displayName, then email prefix
  const username = String(
    existingData?.username || displayName || email?.split("@")[0] || "user",
  )
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "_")
    .slice(0, 20);

  if (!snap.exists) {
    await userRef.set(
      {
        uid,
        email,
        displayName,
        username,
        plan: "free",
        rewardPoints: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    await userRef.set(
      {
        uid,
        email,
        displayName,
        // Only set username if not already set
        ...(existingData?.username ? {} : { username }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  // ── Always sync username to usernames collection ──
  // This ensures the lookup collection stays in sync for all users
  const finalUsername = String(existingData?.username || username)
    .toLowerCase()
    .trim();

  if (finalUsername) {
    const usernameRef = db.collection("usernames").doc(finalUsername);
    const usernameSnap = await usernameRef.get();
    // Only create if not already claimed by someone else
    if (!usernameSnap.exists) {
      await usernameRef.set({
        uid,
        username: finalUsername,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if ((usernameSnap.data() as any)?.uid === uid) {
      // Already owned by this user — update timestamp silently
      await usernameRef.set({ uid, username: finalUsername }, { merge: true });
    }
  }

  return { ok: true, created: !snap.exists };
});

// ── Admin migration: backfill usernames collection for all existing users ──
// Run ONCE from Admin page to populate usernames for users who signed up
// before the username system was added.
export const adminMigrateUsernames = onCall({ cors: true }, async (req) => {
  await requireAdmin(req);

  const usersSnap = await db.collection("users").get();
  let created = 0,
    skipped = 0,
    conflicts = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data() as any;
    const uid = userDoc.id;

    // Derive username from stored username, displayName, or email
    const rawUsername = String(
      data?.username || data?.displayName || data?.email?.split("@")[0] || "",
    )
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, "_")
      .slice(0, 20)
      .replace(/^_+|_+$/g, "");

    if (!rawUsername || rawUsername.length < 2) {
      skipped++;
      continue;
    }

    const usernameRef = db.collection("usernames").doc(rawUsername);
    const existing = await usernameRef.get();

    if (!existing.exists) {
      // Create the username doc
      await usernameRef.set({
        uid,
        username: rawUsername,
        createdAt:
          data?.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
      });

      // Also update the user doc with the normalized username if missing
      if (!data?.username) {
        await userDoc.ref.set({ username: rawUsername }, { merge: true });
      }

      created++;
      console.log(`[migrateUsernames] created: ${rawUsername} → ${uid}`);
    } else if ((existing.data() as any)?.uid === uid) {
      // Already correct
      skipped++;
    } else {
      // Username conflict — append uid suffix to make it unique
      const fallback = `${rawUsername}_${uid.slice(0, 4)}`;
      const fallbackRef = db.collection("usernames").doc(fallback);
      const fallbackSnap = await fallbackRef.get();
      if (!fallbackSnap.exists) {
        await fallbackRef.set({
          uid,
          username: fallback,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await userDoc.ref.set({ username: fallback }, { merge: true });
        created++;
        console.log(
          `[migrateUsernames] conflict resolved: ${fallback} → ${uid}`,
        );
      } else {
        conflicts++;
        console.log(
          `[migrateUsernames] unresolved conflict for uid=${uid} username=${rawUsername}`,
        );
      }
    }
  }

  console.log("[adminMigrateUsernames] done", { created, skipped, conflicts });
  return { ok: true, created, skipped, conflicts, total: usersSnap.size };
});

// ── Admin: Backfill leaderboard entries for all tournament registrations ──────
// Fixes users who joined before ensureLeaderboardEntry was deployed.
// Safe to run multiple times — never overwrites existing points.
export const adminBackfillLeaderboardEntries = onCall(
  { cors: true },
  async (req) => {
    await requireAdmin(req);

    const regsSnap = await db.collection("tournament_registrations").get();
    let created = 0,
      skipped = 0;

    for (const regDoc of regsSnap.docs) {
      const reg = regDoc.data() as any;
      const uid = String(reg.uid ?? "").trim();
      const sport = String(reg.sport ?? "").toUpperCase() as Sport;
      const weekId = String(reg.weekId ?? "").trim();
      const type = String(reg.type ?? "weekly").toLowerCase();

      if (!uid || !sport || !weekId) {
        skipped++;
        continue;
      }
      if (sport !== "NBA" && sport !== "MLB" && sport !== "SOCCER") {
        skipped++;
        continue;
      }
      if (!/^\d{4}-W\d{2}$/.test(weekId)) {
        skipped++;
        continue;
      }
      // Only weekly for now (daily uses picks_daily, different leaderboard)
      if (type !== "weekly") {
        skipped++;
        continue;
      }

      const entryId = leaderboardEntryDocId(weekId, sport, uid);
      const entryRef = db.collection("leaderboardsEntries").doc(entryId);
      const snap = await entryRef.get();

      if (snap.exists) {
        skipped++;
        continue;
      }

      // Entry missing — create it
      await ensureLeaderboardEntry(uid, sport, weekId);
      created++;
      console.log(
        `[backfillLBEntries] created entry: ${sport} ${weekId} uid=${uid}`,
      );
    }

    console.log("[adminBackfillLeaderboardEntries] done", { created, skipped });
    return { ok: true, created, skipped, total: regsSnap.size };
  },
);

export const finalizeWeeklyLeaderboardMLB = onSchedule(
  { schedule: "5 0 * * 0", timeZone: "America/Puerto_Rico" },
  async () => {
    const sport: Sport = "MLB";

    const d = new Date();
    d.setDate(d.getDate() - 1); // go to Sunday
    const weekId = getWeekId(d);

    const lbId = leaderboardDocId(weekId, sport);
    const lbRef = db.collection("leaderboards").doc(lbId);

    const lbSnap = await lbRef.get();
    if (lbSnap.exists && (lbSnap.data() as any)?.finalized === true) return;

    const topSnap = await db
      .collection("leaderboardsEntries")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
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

    // Apply tiebreaker: points → win rate → total picks
    const { sorted: sortedDocsMLB, firstPlaceUids: firstPlaceUidsMLB } = resolveWinners(topSnap.docs);
    const winners = sortedDocsMLB.map((d) => ({
      uid: d.id,
      ...(d.data() as any),
    }));

    const top10Snap = await db
      .collection("leaderboardsEntries")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
      .orderBy("points", "desc")
      .limit(10)
      .get();

    for (const doc of top10Snap.docs) {
      const uid = (doc.data() as any).uid ?? doc.id;
      const data = doc.data() as any;
      const rank = top10Snap.docs.indexOf(doc) + 1;

      const wins = Number(data.wins ?? 0);
      const pushes = Number(data.pushes ?? 0);

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const userData = userSnap.data() as any;
      const plan = String(userData?.plan ?? "free").toLowerCase();
      const isPrem = plan === "premium";

      let rp = 0;
      if (isPrem) {
        rp += wins * 10;
        rp += pushes * 3;
      } else {
        rp += wins * 3;
        rp += pushes * 1;
      }

      // Top 10 bonus (FREE: +10, PREMIUM: +50)
      rp += isPrem ? 50 : 10;

      // Placement bonuses
      if (isPrem) {
        if (rank === 1) rp += 500;
        else if (rank === 2) rp += 200;
        else if (rank === 3) rp += 100;
      } else {
        if (firstPlaceUidsMLB.has(doc.id)) rp += 100;
      }

      await userRef.set(
        {
          rewardPoints: admin.firestore.FieldValue.increment(rp),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (rp > 0) {
        const rankLabel = rank === 1 ? " 🏆 #1" : rank === 2 ? " 🥈 #2" : rank === 3 ? " 🥉 #3" : ` Top ${rank}`;
        await addRewardHistoryAndNotify(
          uid,
          "leaderboard_reward",
          rp,
          `Weekly leaderboard reward — MLB ${weekId}${rankLabel}`,
          { weekId, sport: "MLB", wins, pushes, plan, rank },
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

// -------------DAILY PICKS--------------------//

export const placeDailyPick = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  // ── sport ──
  const sportRaw = String(req.data?.sport ?? "NBA").toUpperCase();
  if (sportRaw !== "NBA" && sportRaw !== "MLB") {
    throw new HttpsError("invalid-argument", "Unsupported sport.");
  }
  const sport = sportRaw as Sport;

  // ── dayId  "YYYY-MM-DD" in Puerto Rico timezone ──
  const dayIdIn = String(req.data?.dayId ?? "").trim();
  if (!dayIdIn || !/^\d{4}-\d{2}-\d{2}$/.test(dayIdIn)) {
    throw new HttpsError("invalid-argument", "dayId is required (YYYY-MM-DD).");
  }
  const dayId = dayIdIn;

  // ── weekId — needed to find the game in the games collection ──
  const weekIdIn = String(req.data?.weekId ?? "").trim();
  if (!weekIdIn) {
    throw new HttpsError("invalid-argument", "weekId is required.");
  }

  // ── market ──
  const marketRaw = String(req.data?.market ?? "").toLowerCase();
  const market: Market =
    marketRaw === "moneyline" ||
    marketRaw === "spread" ||
    marketRaw === "ou" ||
    marketRaw === "total"
      ? (marketRaw as any)
      : null;
  if (!market) throw new HttpsError("invalid-argument", "Invalid market.");

  // ── selection ──
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

  // ── find game (same logic as placePick) ──
  const gameIdIn = String(req.data?.gameId ?? "").trim();
  const gameDocIdIn = String(req.data?.gameDocId ?? "").trim();
  const externalGameId = String(req.data?.externalGameId ?? "").trim();

  if (!gameIdIn && !gameDocIdIn && !externalGameId) {
    throw new HttpsError("invalid-argument", "gameId is required.");
  }

  let gameSnap: FirebaseFirestore.DocumentSnapshot | null = null;

  const tryDocId = async (docId: string) => {
    if (!docId) return null;
    const snap = await db.collection("games").doc(docId).get();
    return snap.exists ? snap : null;
  };

  gameSnap = (await tryDocId(gameDocIdIn)) ?? null;

  if (!gameSnap && gameIdIn.startsWith("NBA_")) {
    gameSnap = (await tryDocId(gameIdIn)) ?? null;
  }

  if (!gameSnap && gameIdIn) {
    const q = await db
      .collection("games")
      .where("sport", "==", sport)
      .where("weekId", "==", weekIdIn)
      .where("gameId", "==", gameIdIn)
      .limit(1)
      .get();
    if (!q.empty) gameSnap = q.docs[0];
  }

  if (!gameSnap && externalGameId) {
    let q = await db
      .collection("games")
      .where("sport", "==", sport)
      .where("weekId", "==", weekIdIn)
      .where("matchKey", "==", externalGameId)
      .limit(1)
      .get();
    if (!q.empty) gameSnap = q.docs[0];

    if (!gameSnap) {
      q = await db
        .collection("games")
        .where("sport", "==", sport)
        .where("weekId", "==", weekIdIn)
        .where("oddsEventId", "==", externalGameId)
        .limit(1)
        .get();
      if (!q.empty) gameSnap = q.docs[0];
    }
  }

  if (!gameSnap) throw new HttpsError("not-found", "Game not found.");

  const game = gameSnap.data() as any;

  // ── lock check ──
  const status = String(game?.status ?? "").toLowerCase();
  const startTime = game?.startTime?.toDate?.() ?? null;
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

  // ── registration check — user must have joined the daily tournament ──
  if (!clear) {
    const dailyTournamentId = `${dayId}_${sport}`;
    const regDocId = `${dailyTournamentId}_${uid}`;
    const regSnap = await db
      .collection("tournament_registrations")
      .doc(regDocId)
      .get();
    if (!regSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "You must join the tournament before making picks.",
      );
    }
  }

  // ── market validation ──
  if (
    market === "moneyline" &&
    !(selection === "home" || selection === "away" || selection === "draw")
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Moneyline selection must be home/away/draw.",
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

  const gameIdField = String(game?.gameId ?? "").trim();
  if (!gameIdField) {
    throw new HttpsError(
      "failed-precondition",
      "Game is missing gameId field.",
    );
  }

  // ── pick doc ID uses dayId instead of weekId ──
  const pickId = `${uid}_${dayId}_${sport}_${gameIdField}_${market}`;
  const pickRef = db.collection("picks_daily").doc(pickId);

  if (clear) {
    await pickRef.delete().catch(() => {});
    return { ok: true, cleared: true, pickId };
  }

  await pickRef.set(
    {
      uid,
      sport,
      league: sport,
      dayId, // ← key difference from weekly
      weekId: weekIdIn, // kept for cross-reference
      gameId: gameIdField,
      gameDocId: gameSnap.id,
      market,
      selection,
      pick: selection,
      line,
      result: "pending",
      pointsAwarded: 0,
      resolvedAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true, pickId };
});

/** ===== (Admin) Backfill Daily Picks — resolve all pending picks_daily for a given dayId ===== *
 * Use this to retroactively resolve picks that were pending before onGameWriteResolveDailyPicks existed.
 * Called from the Admin page.
 */
export const adminBackfillDailyPicks = onCall({ cors: true }, async (req) => {
  await requireAdmin(req);

  const dayIdIn = String(req.data?.dayId ?? "").trim();
  if (!dayIdIn || !/^\d{4}-\d{2}-\d{2}$/.test(dayIdIn)) {
    throw new HttpsError("invalid-argument", "dayId is required (YYYY-MM-DD).");
  }

  const sportFilter = String(req.data?.sport ?? "ALL").toUpperCase();

  // 1. Get all pending picks_daily for this dayId
  let picksQuery: FirebaseFirestore.Query = db
    .collection("picks_daily")
    .where("dayId", "==", dayIdIn)
    .where("result", "==", "pending");

  if (sportFilter === "NBA" || sportFilter === "MLB") {
    picksQuery = picksQuery.where("sport", "==", sportFilter);
  }

  const picksSnap = await picksQuery.get();

  if (picksSnap.empty) {
    return {
      ok: true,
      dayId: dayIdIn,
      resolved: 0,
      skipped: 0,
      message: "No pending picks found for this day.",
    };
  }

  // 2. Group picks by gameId to minimize game lookups
  const gameIdToGame = new Map<string, any>();
  const uniqueGameIds = [
    ...new Set(
      picksSnap.docs.map((d) => String((d.data() as any).gameId ?? "")),
    ),
  ].filter(Boolean);

  for (const gid of uniqueGameIds) {
    // 1) Find game by gameId field
    const q = await db
      .collection("games")
      .where("gameId", "==", gid)
      .limit(1)
      .get();
    if (!q.empty) {
      gameIdToGame.set(gid, { ref: q.docs[0].ref, data: q.docs[0].data() });
      continue;
    }

    // 2) Try by oddsEventId (NBA new format stores gameId = oddsEventId)
    const q2 = await db
      .collection("games")
      .where("oddsEventId", "==", gid)
      .limit(1)
      .get();
    if (!q2.empty) {
      gameIdToGame.set(gid, { ref: q2.docs[0].ref, data: q2.docs[0].data() });
      continue;
    }

    // 3) Try by Firestore doc ID directly
    const byDoc = await db.collection("games").doc(gid).get();
    if (byDoc.exists) {
      gameIdToGame.set(gid, { ref: byDoc.ref, data: byDoc.data() });
      continue;
    }

    // 4) Try gameDocId field stored in the pick (the pick stores gameDocId separately)
  }

  // Additional pass: for picks that store gameDocId separately
  const uniqueGameDocIds = [
    ...new Set(
      picksSnap.docs
        .map((d) => String((d.data() as any).gameDocId ?? ""))
        .filter(Boolean),
    ),
  ];
  for (const docId of uniqueGameDocIds) {
    // Skip if already found by gameId
    const alreadyFound = [...gameIdToGame.values()].some(
      (v) => v.ref?.id === docId,
    );
    if (alreadyFound) continue;

    const snap = await db.collection("games").doc(docId).get();
    if (snap.exists) {
      // Map both the docId and the game's gameId to this entry
      const data = snap.data() as any;
      const gameIdField = String(data?.gameId ?? "").trim();
      const entry = { ref: snap.ref, data };
      gameIdToGame.set(docId, entry);
      if (gameIdField && !gameIdToGame.has(gameIdField)) {
        gameIdToGame.set(gameIdField, entry);
      }
    }
  }

  let resolved = 0;
  let skipped = 0;
  const notificationsToSend: Array<{
    uid: string;
    result: Exclude<PickResult, "pending">;
    points: number;
    pick: any;
  }> = [];

  // 3. Resolve picks in batches using transactions (max 500 writes per tx)
  const BATCH_SIZE = 400;
  const docs = picksSnap.docs;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);

    await db.runTransaction(async (tx) => {
      for (const docSnap of batch) {
        const pick = docSnap.data() as any;
        const gameId = String(pick.gameId ?? "");
        const gameDocId = String(pick.gameDocId ?? "");

        // Try gameId first, then gameDocId as fallback
        const gameEntry =
          gameIdToGame.get(gameId) ?? gameIdToGame.get(gameDocId);

        if (!gameEntry) {
          skipped++;
          continue;
        }

        const game = gameEntry.data;
        const status = String(game?.status ?? "").toLowerCase();

        if (status !== "final") {
          skipped++;
          continue;
        }

        const result = computePickResult(game, pick);
        const points = pointsForResult(result, {
          sport: String(pick.sport ?? game.sport ?? ""),
          selection: String(pick.selection ?? pick.pick ?? ""),
        });

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
            lbId: String(pick.dayId ?? ""),
            lbEnsured: true,
            leaderboardApplied: true,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        resolved++;
        notificationsToSend.push({
          uid: String(pick.uid ?? "").trim(),
          result,
          points,
          pick,
        });
      }
    });
  }

  // 4. Send notifications outside transaction
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
    const gameEntry = gameIdToGame.get(String(item.pick?.gameId ?? ""));
    const game = gameEntry?.data ?? {};

    await createNotification({
      uid: item.uid,
      type,
      title:
        item.result === "win"
          ? "You won your daily pick"
          : item.result === "loss"
            ? "Daily pick settled"
            : "Your daily pick pushed",
      body:
        item.result === "win"
          ? `${gameLabel(game)} • ${selection} (${market}) won. +${item.points} pts.`
          : item.result === "loss"
            ? `${gameLabel(game)} • ${selection} (${market}) did not hit.`
            : `${gameLabel(game)} • ${selection} (${market}) pushed. +${item.points} pts.`,
      dedupeKey: `daily_backfill_${dayIdIn}_${item.pick?.gameId ?? ""}_${item.pick?.market ?? ""}`,
      ctaUrl: "/my-picks",
      meta: {
        dayId: dayIdIn,
        sport: item.pick?.sport,
        result: item.result,
        pointsAwarded: item.points,
      },
    });
  }

  console.log("[adminBackfillDailyPicks]", {
    dayId: dayIdIn,
    sport: sportFilter,
    resolved,
    skipped,
  });
  return { ok: true, dayId: dayIdIn, sport: sportFilter, resolved, skipped };
});

// ─────────────────────────────────────────────────────────────────────────────
// DAILY LEADERBOARD FINALIZATION
// ─────────────────────────────────────────────────────────────────────────────
//
// Daily RP reward structure (separate from weekly):
//   FREE:    wins × 1 RP  + pushes × 0 RP + 3 RP bonus top10 + 25 RP bonus #1
//   PREMIUM: wins × 5 RP  + pushes × 1 RP + 25 RP bonus top10 + 100 RP #1 / 50 RP #2 / 25 RP #3
//
// Runs every night at 11:55 PM Puerto Rico time for both NBA and MLB.
// ─────────────────────────────────────────────────────────────────────────────

const DAILY_RP_FREE_WIN = 1;
const DAILY_RP_FREE_PUSH = 0;
const DAILY_RP_FREE_TOP10 = 3;
const DAILY_RP_FREE_WINNER = 25;   // #1 bonus FREE (unchanged)
const DAILY_RP_PREM_WIN = 5;
const DAILY_RP_PREM_PUSH = 1;
const DAILY_RP_PREM_TOP10 = 25;    // Top 10 bonus PREMIUM (5 → 25)
const DAILY_RP_PREM_WINNER  = 100; // #1 bonus PREMIUM (50 → 100)
const DAILY_RP_PREM_SECOND  = 50;  // #2 bonus PREMIUM (new)
const DAILY_RP_PREM_THIRD   = 25;  // #3 bonus PREMIUM (new)

async function runFinalizeDailyLeaderboard(dayId: string, sport: Sport) {
  console.log(`[finalizeDailyLeaderboard] START dayId=${dayId} sport=${sport}`);

  // Guard: check if already finalized
  const lbDocId = `${dayId}_${sport}`;
  const lbRef = db.collection("leaderboards").doc(lbDocId);
  const lbSnap = await lbRef.get();
  if (lbSnap.exists && (lbSnap.data() as any)?.finalized === true) {
    console.log(`[finalizeDailyLeaderboard] Already finalized ${lbDocId}`);
    return { skipped: true, reason: "already-finalized" };
  }

  // 1. Get all resolved picks_daily for this dayId + sport
  const picksSnap = await db
    .collection("picks_daily")
    .where("dayId", "==", dayId)
    .where("sport", "==", sport)
    .where("result", "in", ["win", "loss", "push"])
    .get();

  if (picksSnap.empty) {
    console.log(
      `[finalizeDailyLeaderboard] No resolved picks for ${dayId} ${sport} — marking finalized anyway`,
    );
    await lbRef.set(
      {
        sport,
        dayId,
        finalized: true,
        finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { rewarded: 0, skipped: 0 };
  }

  // 2. Aggregate picks into per-user stats
  const playerMap = new Map<
    string,
    {
      uid: string;
      wins: number;
      losses: number;
      pushes: number;
      points: number;
      picks: number;
    }
  >();

  for (const d of picksSnap.docs) {
    const p = d.data() as any;
    const uid = String(p.uid ?? p.userId ?? "").trim();
    if (!uid) continue;
    const e = playerMap.get(uid) ?? {
      uid,
      wins: 0,
      losses: 0,
      pushes: 0,
      points: 0,
      picks: 0,
    };
    e.picks++;
    if (p.result === "win") {
      e.wins++;
      e.points += p.pointsAwarded ?? 100;
    }
    if (p.result === "push") {
      e.pushes++;
      e.points += p.pointsAwarded ?? 50;
    }
    if (p.result === "loss") {
      e.losses++;
    }
    playerMap.set(uid, e);
  }

  // 3. Sort by points descending → leaderboard ranking
  const ranked = Array.from(playerMap.values()).sort(
    (a, b) => b.points - a.points || b.wins - a.wins,
  );

  if (ranked.length === 0) {
    await lbRef.set(
      {
        sport,
        dayId,
        finalized: true,
        finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { rewarded: 0, skipped: 0 };
  }

  const winner = ranked[0];
  const top10 = ranked.slice(0, 10);

  // 4. Write leaderboardsEntries docs (one per user) — so daily leaderboard page can read them
  const batch = db.batch();
  for (const player of ranked) {
    const entryRef = db
      .collection("leaderboardsEntries")
      .doc(`${dayId}_${sport}_${player.uid}`);
    batch.set(
      entryRef,
      {
        uid: player.uid,
        dayId,
        sport,
        points: player.points,
        wins: player.wins,
        losses: player.losses,
        pushes: player.pushes,
        picks: player.picks,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();

  // 5. Give RP rewards to top 10
  let rewarded = 0;
  for (let i = 0; i < top10.length; i++) {
    const player = top10[i];
    if (!player.uid) continue;

    const userRef = db.collection("users").doc(player.uid);
    const userSnap = await userRef.get();
    const plan = String((userSnap.data() as any)?.plan ?? "free").toLowerCase();
    const isPremium = plan === "premium";

    let rp = 0;

    // Per-win and per-push RP
    if (isPremium) {
      rp += player.wins * DAILY_RP_PREM_WIN;
      rp += player.pushes * DAILY_RP_PREM_PUSH;
    } else {
      rp += player.wins * DAILY_RP_FREE_WIN;
      rp += player.pushes * DAILY_RP_FREE_PUSH;
    }

    // Top 10 bonus
    rp += isPremium ? DAILY_RP_PREM_TOP10 : DAILY_RP_FREE_TOP10;

    // Placement bonuses — PREMIUM only gets #1/#2/#3
    const rank = i + 1;
    if (isPremium) {
      if (rank === 1) rp += DAILY_RP_PREM_WINNER;
      else if (rank === 2) rp += DAILY_RP_PREM_SECOND;
      else if (rank === 3) rp += DAILY_RP_PREM_THIRD;
    } else {
      // FREE: only #1 gets winner bonus
      if (player.uid === winner.uid) rp += DAILY_RP_FREE_WINNER;
    }

    if (rp <= 0) continue;

    await userRef.set(
      {
        rewardPoints: admin.firestore.FieldValue.increment(rp),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const rankLabel = rank === 1 ? " 🏆 #1 Winner" : rank === 2 ? " 🥈 #2 Place" : rank === 3 ? " 🥉 #3 Place" : ` — Top ${rank}`;
    await addRewardHistoryAndNotify(
      player.uid,
      "leaderboard_reward",
      rp,
      `Daily leaderboard reward — ${dayId} (${sport})${rankLabel}`,
      {
        dayId,
        sport,
        wins: player.wins,
        pushes: player.pushes,
        points: player.points,
        rank,
        isWinner: rank === 1,
        plan,
      },
    );

    rewarded++;
  }

  // 6. Mark leaderboard as finalized
  await lbRef.set(
    {
      sport,
      dayId,
      finalized: true,
      finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      totalPlayers: ranked.length,
      winner: {
        uid: winner.uid,
        points: winner.points,
        wins: winner.wins,
      },
    },
    { merge: true },
  );

  console.log(
    `[finalizeDailyLeaderboard] DONE dayId=${dayId} sport=${sport} rewarded=${rewarded} totalPlayers=${ranked.length}`,
  );
  return {
    rewarded,
    skipped: top10.length - rewarded,
    totalPlayers: ranked.length,
  };
}

/** ===== (6a) Finalize Daily Leaderboard — NBA (11:55 PM PR every day) ===== */
export const finalizeDailyLeaderboardNBA = onSchedule(
  { schedule: "55 23 * * *", timeZone: "America/Puerto_Rico" },
  async () => {
    // Get yesterday's dayId in Puerto Rico time (since it's 11:55 PM, today's games are done)
    const pr = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
    );
    const y = pr.getFullYear();
    const m = String(pr.getMonth() + 1).padStart(2, "0");
    const d = String(pr.getDate()).padStart(2, "0");
    const dayId = `${y}-${m}-${d}`;
    await runFinalizeDailyLeaderboard(dayId, "NBA");
  },
);

/** ===== (6b) Finalize Daily Leaderboard — MLB (11:55 PM PR every day) ===== */
export const finalizeDailyLeaderboardMLB = onSchedule(
  { schedule: "55 23 * * *", timeZone: "America/Puerto_Rico" },
  async () => {
    const pr = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
    );
    const y = pr.getFullYear();
    const m = String(pr.getMonth() + 1).padStart(2, "0");
    const d = String(pr.getDate()).padStart(2, "0");
    const dayId = `${y}-${m}-${d}`;
    await runFinalizeDailyLeaderboard(dayId, "MLB");
  },
);

/** ===== (6c) Admin: Manually finalize daily leaderboard for a specific day ===== */
export const adminFinalizeDailyRewards = onCall({ cors: true }, async (req) => {
  await requireAdmin(req);

  const dayIdIn = String(req.data?.dayId ?? "").trim();
  if (!dayIdIn || !/^\d{4}-\d{2}-\d{2}$/.test(dayIdIn)) {
    throw new HttpsError("invalid-argument", "dayId is required (YYYY-MM-DD).");
  }

  const sportRaw = String(req.data?.sport ?? "ALL").toUpperCase();
  const force = req.data?.force === true;

  // If force=true, delete the finalized flag first so it can re-run
  if (force) {
    const sportsToRun: Sport[] =
      sportRaw === "ALL" ? ["NBA", "MLB"] : [sportRaw as Sport];
    for (const s of sportsToRun) {
      await db
        .collection("leaderboards")
        .doc(`${dayIdIn}_${s}`)
        .set({ finalized: false }, { merge: true });
    }
  }

  const sportsToRun: Sport[] =
    sportRaw === "ALL" ? ["NBA", "MLB"] : [sportRaw as Sport];
  const results: Record<string, any> = {};

  for (const s of sportsToRun) {
    results[s] = await runFinalizeDailyLeaderboard(dayIdIn, s);
  }

  return { ok: true, dayId: dayIdIn, sport: sportRaw, results };
});
/**
 * loadMLBPropsGames — v2
 * ──────────────────────
 * Uses the ALTERNATE props markets from The Odds API which include
 * team info per player. Picks:
 *   • 1 starting pitcher per team  (pitcher_strikeouts_alternate)
 *   • 1 star batter per team       (batter_hits_alternate or batter_home_runs_alternate)
 * Plus game lines: moneyline + spread + total.
 *
 * Setup:
 *   firebase functions:secrets:set ODDS_API_KEY
 *   firebase deploy --only functions:loadMLBPropsGames,functions:loadMLBPropsGamesHttp
 */

import * as functions from "firebase-functions/v2";

import { getFirestore } from "firebase-admin/firestore";

// ─── Config ───────────────────────────────────────────────────────────────────

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const SPORT = "baseball_mlb";
const REGIONS = "us";
const ODDS_FORMAT = "american";

// Alternate markets include the team field per player
const PROP_MARKETS_PITCHER = [
  "pitcher_strikeouts_alternate", // ← includes team
  "pitcher_hits_allowed_alternate",
];
const PROP_MARKETS_BATTER = [
  "batter_hits_alternate", // ← includes team
  "batter_home_runs_alternate",
  "batter_rbis_alternate",
  "batter_strikeouts_alternate",
];

// Preferred bookmakers in order
const BK_PRIORITY = [
  "draftkings",
  "fanduel",
  "betmgm",
  "bovada",
  "williamhill_us",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

//function getWeekIdMixed(date: Date): string {
//  const d = new Date(date);
//d.setUTCHours(0, 0, 0, 0);
//d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
//const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
//const week = Math.ceil(
// .. ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
// );
//return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
//}

function nameToId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OddsOutcome {
  name: string;
  description?: string; // player name
  price: number;
  point?: number;
}

interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  markets: OddsMarket[];
}

interface OddsGame {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: OddsBookmaker[];
}

interface PlayerProp {
  playerId: string;
  playerName: string;
  playerRole: "pitcher" | "batter";
  team: string;
  market: string;
  line: number;
  overOdds: number | null;
  underOdds: number | null;
}

interface GameLine {
  market: string;
  label: string;
  line?: number;
  odds?: number | null;
}

// ─── Parse game lines ─────────────────────────────────────────────────────────

function bestBk(bks: OddsBookmaker[] = []): OddsBookmaker | null {
  for (const key of BK_PRIORITY) {
    const b = bks.find((b) => b.key === key);
    if (b) return b;
  }
  return bks[0] ?? null;
}

function parseLines(game: OddsGame): GameLine[] {
  const lines: GameLine[] = [];
  const bk = bestBk(game.bookmakers);
  if (!bk) return lines;

  for (const m of bk.markets) {
    if (m.key === "h2h") {
      for (const o of m.outcomes) {
        const isHome = o.name === game.home_team;
        lines.push({
          market: isHome ? "moneyline_home" : "moneyline_away",
          label: `${o.name} ML`,
          odds: o.price,
        });
      }
    }
    if (m.key === "spreads") {
      for (const o of m.outcomes) {
        const isHome = o.name === game.home_team;
        const sign = (o.point ?? 0) > 0 ? "+" : "";
        lines.push({
          market: isHome ? "spread_home" : "spread_away",
          label: `${o.name} ${sign}${o.point}`,
          line: o.point,
          odds: o.price,
        });
      }
    }
    if (m.key === "totals") {
      for (const o of m.outcomes) {
        const isOver = o.name.toLowerCase() === "over";
        lines.push({
          market: isOver ? "total_over" : "total_under",
          label: `${o.name} ${o.point}`,
          line: o.point,
          odds: o.price,
        });
      }
    }
  }
  return lines;
}

// ─── Parse player props ───────────────────────────────────────────────────────

/**
 * Alternate props markets structure:
 * outcome.name       = "Over" | "Under"
 * outcome.description = "Player Name"   ← player
 * outcome.point      = line value
 * outcome.price      = odds
 *
 * Team is NOT in the outcome directly, but we can infer from:
 * the `description` field sometimes has "Team Abbreviation - Player Name"
 * If not, we use lineup position (first pitcher seen = likely starter).
 */
function parseProps(
  propsGame: OddsGame,
  homeTeam: string,
  awayTeam: string,
): PlayerProp[] {
  const bk = bestBk(propsGame.bookmakers);
  if (!bk) return [];

  // Collect all props per player per market
  type PropEntry = {
    line: number;
    overOdds: number | null;
    underOdds: number | null;
    team: string;
  };
  const pitcherProps = new Map<string, PropEntry>(); // playerName → best prop
  const batterProps = new Map<string, PropEntry>();

  const isPitcherMarket = (k: string) => PROP_MARKETS_PITCHER.includes(k);
  const isBatterMarket = (k: string) => PROP_MARKETS_BATTER.includes(k);

  for (const market of bk.markets) {
    if (!isPitcherMarket(market.key) && !isBatterMarket(market.key)) continue;

    // Group outcomes by player (description field)
    const byPlayer = new Map<
      string,
      { over?: OddsOutcome; under?: OddsOutcome; team: string }
    >();

    for (const o of market.outcomes) {
      // description = player name, sometimes "TOR - Kevin Gausman"
      let rawName = o.description ?? o.name;
      let team = "";

      // Try to extract team from "TEAM - Player Name" pattern
      const dashMatch = rawName.match(/^([A-Z]{2,3})\s*[-–]\s*(.+)$/);
      if (dashMatch) {
        team = dashMatch[1];
        rawName = dashMatch[2].trim();
      }

      if (!byPlayer.has(rawName)) byPlayer.set(rawName, { team });
      const entry = byPlayer.get(rawName)!;
      if (!entry.team && team) entry.team = team;

      if (o.name.toLowerCase() === "over") entry.over = o;
      if (o.name.toLowerCase() === "under") entry.under = o;
    }

    for (const [pName, data] of byPlayer.entries()) {
      const line = data.over?.point ?? data.under?.point ?? 0;
      const prop: PropEntry = {
        line,
        overOdds: data.over?.price ?? null,
        underOdds: data.under?.price ?? null,
        team: data.team,
      };

      if (isPitcherMarket(market.key) && !pitcherProps.has(pName)) {
        pitcherProps.set(pName, prop);
      }
      if (isBatterMarket(market.key) && !batterProps.has(pName)) {
        batterProps.set(pName, prop);
      }
    }
  }

  const result: PlayerProp[] = [];

  // Pick 1 pitcher per team.
  // When the API provides team info (e.g. "HOU - Colton Gordon") use resolveTeam().
  // When team is empty (API doesn't include it), alternate: 1st pitcher → homeTeam, 2nd → awayTeam.
  const usedPitcherTeams = new Set<string>();
  const pitcherFallback = [homeTeam, awayTeam];
  let pitcherFallbackIdx = 0;

  for (const [pName, prop] of pitcherProps.entries()) {
    let team: string;
    if (prop.team) {
      team = resolveTeam(prop.team, homeTeam, awayTeam);
    } else {
      team = pitcherFallback[pitcherFallbackIdx] ?? homeTeam;
    }
    // If team already taken, try the other one
    if (usedPitcherTeams.has(team)) {
      const other = team === homeTeam ? awayTeam : homeTeam;
      if (usedPitcherTeams.has(other)) continue;
      team = other;
    }
    result.push({
      playerId: nameToId(pName),
      playerName: pName,
      playerRole: "pitcher",
      team,
      market: "pitcher_strikeouts",
      line: prop.line,
      overOdds: prop.overOdds,
      underOdds: prop.underOdds,
    });
    usedPitcherTeams.add(team);
    pitcherFallbackIdx++;
    if (usedPitcherTeams.size >= 2) break;
  }

  // Pick 1 batter per team — same alternating strategy
  const usedBatterTeams = new Set<string>();
  const batterFallback = [homeTeam, awayTeam];
  let batterFallbackIdx = 0;

  for (const [pName, prop] of batterProps.entries()) {
    let team: string;
    if (prop.team) {
      team = resolveTeam(prop.team, homeTeam, awayTeam);
    } else {
      team = batterFallback[batterFallbackIdx] ?? homeTeam;
    }
    if (usedBatterTeams.has(team)) {
      const other = team === homeTeam ? awayTeam : homeTeam;
      if (usedBatterTeams.has(other)) continue;
      team = other;
    }
    result.push({
      playerId: nameToId(pName),
      playerName: pName,
      playerRole: "batter",
      team,
      market: "batter_hits",
      line: prop.line,
      overOdds: prop.overOdds,
      underOdds: prop.underOdds,
    });
    usedBatterTeams.add(team);
    batterFallbackIdx++;
    if (usedBatterTeams.size >= 2) break;
  }

  return result;
}

/** Map team abbreviation or partial name to full team name */
function resolveTeam(raw: string, homeTeam: string, awayTeam: string): string {
  if (!raw) return homeTeam; // fallback
  const r = raw.toUpperCase();
  // Check if the abbreviation appears in the full team name
  if (
    homeTeam.toUpperCase().includes(r) ||
    r.includes(homeTeam.split(" ").pop()!.toUpperCase())
  )
    return homeTeam;
  if (
    awayTeam.toUpperCase().includes(r) ||
    r.includes(awayTeam.split(" ").pop()!.toUpperCase())
  )
    return awayTeam;
  return homeTeam; // fallback
}

// ─── Core loader ──────────────────────────────────────────────────────────────

async function runLoader(): Promise<{ games: number; weekId: string }> {
  const db = getFirestore();
  const weekId = getWeekId(new Date());
  const apiKey = process.env.ODDS_API_KEY ?? "";

  // 1. Fetch today's games + game lines
  const gamesUrl = `${ODDS_BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=${REGIONS}&markets=h2h,spreads,totals&oddsFormat=${ODDS_FORMAT}&dateFormat=iso`;
  const games = await fetchJson<OddsGame[]>(gamesUrl);
  console.log(`[MLB] ${games.length} games for weekId=${weekId}`);

  const batchRef = db.batch();

  for (const game of games) {
    const lines = parseLines(game);

    // 2. Fetch player props for this game
    const allPropMarkets = [
      ...PROP_MARKETS_PITCHER,
      ...PROP_MARKETS_BATTER,
    ].join(",");
    const propsUrl = `${ODDS_BASE}/sports/${SPORT}/events/${game.id}/odds?apiKey=${apiKey}&regions=${REGIONS}&markets=${allPropMarkets}&oddsFormat=${ODDS_FORMAT}&dateFormat=iso`;

    let props: PlayerProp[] = [];
    try {
      const propsGame = await fetchJson<OddsGame>(propsUrl);
      props = parseProps(propsGame, game.home_team, game.away_team);
    } catch (e) {
      console.warn(`[MLB] props fetch failed for ${game.id}:`, e);
    }

    // 3. Write to Firestore
    const ref = db.collection("player_props_games").doc(game.id);
    batchRef.set(
      ref,
      {
        gameId: game.id,
        weekId,
        sport: "MLB",
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        startTime: new Date(game.commence_time),
        status: "scheduled",
        lines,
        props,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batchRef.commit();
  return { games: games.length, weekId };
}

// ─── Scheduled function (daily 8 AM ET) ──────────────────────────────────────

export const loadMLBPropsGames = functions.scheduler.onSchedule(
  {
    schedule: "0 12 * * *",
    timeZone: "America/New_York",
    secrets: ["ODDS_API_KEY"],
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    const result = await runLoader();
    console.log(`[loadMLBPropsGames] done:`, result);
  },
);

// ─── HTTP trigger for manual testing ─────────────────────────────────────────
// curl -X POST https://<region>-<project>.cloudfunctions.net/loadMLBPropsGamesHttp \
//   -H "Authorization: Bearer $(gcloud auth print-identity-token)"

export const loadMLBPropsGamesHttp = functions.https.onRequest(
  {
    secrets: ["ODDS_API_KEY"],
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (_req, res) => {
    try {
      const result = await runLoader();
      res.json({ ok: true, ...result });
    } catch (e: any) {
      console.error("[loadMLBPropsGamesHttp] error:", e);
      res.status(500).json({ error: String(e?.message ?? e) });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// MLB PLAYER PROPS SYNC (The Odds API)
// Writes docs into: player_props_games/{eventId}
// Fields are shaped to match app/tournaments/mixed/mlb-props/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

type MlbLineMarket =
  | "moneyline_home"
  | "moneyline_away"
  | "spread_home"
  | "spread_away"
  | "total_over"
  | "total_under";

type MlbPropMarket =
  | "pitcher_strikeouts"
  | "pitcher_hits_allowed"
  | "batter_home_runs"
  | "batter_hits"
  | "batter_rbis"
  | "batter_strikeouts";

type PlayerRole = "pitcher" | "batter";

interface PlayerPropCard {
  playerId: string;
  playerName: string;
  playerRole: PlayerRole;
  team: string;
  market: MlbPropMarket;
  line: number;
  overOdds?: number | null;
  underOdds?: number | null;
}

interface GameLineCard {
  market: MlbLineMarket;
  label: string;
  line?: number;
  odds?: number | null;
}

const MLB_PROP_MARKETS: MlbPropMarket[] = [
  "pitcher_strikeouts",
  "pitcher_hits_allowed",
  "batter_home_runs",
  "batter_hits",
  "batter_rbis",
  "batter_strikeouts",
];

function prDateParts(date: Date) {
  const pr = new Date(
    date.toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
  );
  const yyyy = pr.getFullYear();
  const mm = String(pr.getMonth() + 1).padStart(2, "0");
  const dd = String(pr.getDate()).padStart(2, "0");
  return {
    yyyy,
    mm,
    dd,
    ymd: `${yyyy}-${mm}-${dd}`,
    date: pr,
  };
}

function getTomorrowSlateDatePR() {
  const nowPr = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
  );
  nowPr.setDate(nowPr.getDate() + 1);
  return prDateParts(nowPr).ymd;
}

function isTomorrowInPR(date: Date) {
  return prDateParts(date).ymd === getTomorrowSlateDatePR();
}

function safePlayerId(name: string, market: string) {
  return String(name || "player")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .concat("_", String(market).toLowerCase());
}

function normalizeTeamAbbr(raw: string) {
  return mlbAbbr(raw) ?? raw;
}

function outcomeNameToSide(
  outcomeName: string,
  homeTeamRaw: string,
  awayTeamRaw: string,
): "home" | "away" | null {
  if (outcomeName === homeTeamRaw) return "home";
  if (outcomeName === awayTeamRaw) return "away";
  return null;
}

function parseGameLinesFromBook(book: any, ev: any): GameLineCard[] {
  const markets = Array.isArray(book?.markets) ? book.markets : [];
  const homeRaw = String(ev?.home_team ?? "");
  const awayRaw = String(ev?.away_team ?? "");
  const home = normalizeTeamAbbr(homeRaw);
  const away = normalizeTeamAbbr(awayRaw);

  const lines: GameLineCard[] = [];

  const h2h = markets.find((m: any) => m?.key === "h2h");
  if (h2h?.outcomes?.length) {
    for (const o of h2h.outcomes) {
      const side = outcomeNameToSide(String(o?.name ?? ""), homeRaw, awayRaw);
      if (!side) continue;
      lines.push({
        market: side === "home" ? "moneyline_home" : "moneyline_away",
        label: side === "home" ? `${home} ML` : `${away} ML`,
        odds: typeof o?.price === "number" ? o.price : null,
      });
    }
  }

  const spreads = markets.find((m: any) => m?.key === "spreads");
  if (spreads?.outcomes?.length) {
    for (const o of spreads.outcomes) {
      const side = outcomeNameToSide(String(o?.name ?? ""), homeRaw, awayRaw);
      if (!side) continue;
      const point =
        typeof o?.point === "number" && Number.isFinite(o.point)
          ? Number(o.point)
          : undefined;

      const team = side === "home" ? home : away;
      const pretty = point == null ? "—" : point > 0 ? `+${point}` : `${point}`;

      lines.push({
        market: side === "home" ? "spread_home" : "spread_away",
        label: `${team} ${pretty}`,
        line: point,
        odds: typeof o?.price === "number" ? o.price : null,
      });
    }
  }

  const totals = markets.find((m: any) => m?.key === "totals");
  if (totals?.outcomes?.length) {
    for (const o of totals.outcomes) {
      const name = String(o?.name ?? "").toLowerCase();
      const point =
        typeof o?.point === "number" && Number.isFinite(o.point)
          ? Number(o.point)
          : undefined;
      if (name !== "over" && name !== "under") continue;

      lines.push({
        market: name === "over" ? "total_over" : "total_under",
        label: `${name === "over" ? "Over" : "Under"} ${point ?? "—"}`,
        line: point,
        odds: typeof o?.price === "number" ? o.price : null,
      });
    }
  }

  const deduped = new Map<string, GameLineCard>();
  for (const line of lines) deduped.set(line.market, line);
  return Array.from(deduped.values());
}

function parsePlayerPropOutcomes(propsGame: any, ev: any): PlayerPropCard[] {
  const bookmakers = Array.isArray(propsGame?.bookmakers)
    ? propsGame.bookmakers
    : [];
  const book = bookmakers.length ? selectBestBookmaker(propsGame) : null;
  if (!book) return [];

  
  const markets = Array.isArray(book?.markets) ? book.markets : [];

  const cards: PlayerPropCard[] = [];

  for (const market of markets) {
    const key = String(market?.key ?? "") as MlbPropMarket;
    if (!MLB_PROP_MARKETS.includes(key)) continue;

    const outcomes = Array.isArray(market?.outcomes) ? market.outcomes : [];
    const grouped = new Map<
      string,
      {
        playerName: string;
        line: number;
        overOdds?: number | null;
        underOdds?: number | null;
        description?: string;
      }
    >();

    for (const o of outcomes) {
      const playerName = String(o?.description ?? o?.name ?? "").trim();
      const sideName = String(o?.name ?? "").toLowerCase();
      const line =
        typeof o?.point === "number" && Number.isFinite(o.point)
          ? Number(o.point)
          : null;

      if (!playerName || line == null) continue;
      const groupKey = `${playerName}__${line}`;

      const current = grouped.get(groupKey) ?? {
        playerName,
        line,
        description: String(o?.description ?? "").trim(),
      };

      if (sideName === "over") current.overOdds = o?.price ?? null;
      if (sideName === "under") current.underOdds = o?.price ?? null;

      grouped.set(groupKey, current);
    }

    for (const [, g] of grouped) {
      const role: PlayerRole = key.startsWith("pitcher_")
        ? "pitcher"
        : "batter";

      // Team inference:
      // The Odds API does not explicitly label team on every outcome.
      // We infer from event matchup and let the UI show the chosen team badge.
      // Safe default: attach pitcher/batter to home if unknown? No.
      // Better: store "TBD" if not enough info.
      let team = "TBD";

      // Heuristic:
      // if player's prop exists for event, most books only include players on teams in the matchup.
      // We'll leave team TBD here unless we infer later when picking representative cards.
      // To keep your UI clean, we prefer home/away inference later.
      cards.push({
        playerId: safePlayerId(g.playerName, key),
        playerName: g.playerName,
        playerRole: role,
        team,
        market: key,
        line: g.line,
        overOdds: g.overOdds ?? null,
        underOdds: g.underOdds ?? null,
      });
    }
  }

  return cards;
}

function chooseRepresentativePitcher(
  props: PlayerPropCard[],
  homeTeam: string,
  awayTeam: string,
) {
  const pitchers = props.filter((p) => p.playerRole === "pitcher");
  if (!pitchers.length) return null;

  // Prefer strikeouts market, then hits allowed
  pitchers.sort((a, b) => {
    const aScore =
      (a.market === "pitcher_strikeouts" ? 100 : 0) +
      (typeof a.line === "number" ? a.line : 0);
    const bScore =
      (b.market === "pitcher_strikeouts" ? 100 : 0) +
      (typeof b.line === "number" ? b.line : 0);
    return bScore - aScore;
  });

  const chosen = pitchers[0];
  // Clean UI default: assign to home team if still TBD and market exists
  return {
    ...chosen,
    team: chosen.team === "TBD" ? homeTeam : chosen.team,
  };
}

function chooseRepresentativeBatter(
  props: PlayerPropCard[],
  homeTeam: string,
  awayTeam: string,
) {
  const batters = props.filter((p) => p.playerRole === "batter");
  if (!batters.length) return null;

  const priority: Record<string, number> = {
    batter_hits: 100,
    batter_home_runs: 90,
    batter_rbis: 80,
    batter_strikeouts: 60,
  };

  batters.sort((a, b) => {
    const aScore = (priority[a.market] ?? 0) + (a.overOdds != null ? 10 : 0);
    const bScore = (priority[b.market] ?? 0) + (b.overOdds != null ? 10 : 0);
    return bScore - aScore;
  });

  const chosen = batters[0];
  return {
    ...chosen,
    team: chosen.team === "TBD" ? homeTeam : chosen.team,
  };
}

async function runMlbPlayerPropsSync(opts?: {
  force?: boolean;
  tomorrowOnly?: boolean;
}) {
  const apiKey = ODDS_API_KEY.value();
  const force = opts?.force === true;
  const tomorrowOnly = opts?.tomorrowOnly !== false;

  const url = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds";

  const { data } = await axios.get(url, {
    params: {
      apiKey,
      regions: "us",
      markets: "h2h,spreads,totals",
      oddsFormat: "american",
      dateFormat: "iso",
      bookmakers: "draftkings,fanduel,betmgm,williamhill_us",
    },
    timeout: 25000,
  });

  const events: Array<any> = Array.isArray(data) ? data : [];

  let upserted = 0;
  let skipped = 0;
  let propsFetched = 0;

  for (const ev of events) {
    const commence = new Date(ev?.commence_time);
    if (Number.isNaN(commence.getTime())) {
      skipped++;
      continue;
    }

    if (tomorrowOnly && !isTomorrowInPR(commence)) {
      skipped++;
      continue;
    }

    const homeRaw = String(ev?.home_team ?? "").trim();
    const awayRaw = String(ev?.away_team ?? "").trim();
    const homeTeam = normalizeTeamAbbr(homeRaw);
    const awayTeam = normalizeTeamAbbr(awayRaw);
    const eventId = String(ev?.id ?? "").trim();

    if (!eventId || !homeTeam || !awayTeam) {
      skipped++;
      continue;
    }

    const book = selectBestBookmaker(ev);
    const lines = book ? parseGameLinesFromBook(book, ev) : [];

    // Additional/player markets must be fetched one event at a time
    const propsUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${eventId}/odds`;

    let parsedProps: PlayerPropCard[] = [];
    try {
      const propsRes = await axios.get(propsUrl, {
        params: {
          apiKey,
          regions: "us",
          markets: MLB_PROP_MARKETS.join(","),
          oddsFormat: "american",
          dateFormat: "iso",
          bookmakers: "draftkings,fanduel,betmgm,williamhill_us",
        },
        timeout: 25000,
      });

      parsedProps = parsePlayerPropOutcomes(propsRes.data, ev);
      propsFetched++;
    } catch (err) {
      console.warn(
        `[runMlbPlayerPropsSync] props fetch failed for ${eventId}`,
        err,
      );
    }

    const pitcher = chooseRepresentativePitcher(
      parsedProps,
      homeTeam,
      awayTeam,
    );
    const batter = chooseRepresentativeBatter(parsedProps, homeTeam, awayTeam);

    const props = [pitcher, batter].filter(Boolean) as PlayerPropCard[];
    const weekId = getWeekId(commence);
    const slateDate = prDateParts(commence).ymd;

    const docRef = db.collection("player_props_games").doc(eventId);

    await docRef.set(
      {
        gameId: eventId,
        oddsEventId: eventId,
        sport: "MLB",
        weekId,
        slateDate,
        homeTeam,
        awayTeam,
        startTime: admin.firestore.Timestamp.fromDate(commence),
        status: "scheduled",
        scoreHome: null,
        scoreAway: null,
        lines,
        props,
        source: "oddsapi",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    upserted++;
  }

  console.log("[runMlbPlayerPropsSync] done", {
    upserted,
    skipped,
    propsFetched,
    tomorrowOnly,
    force,
  });

  return { upserted, skipped, propsFetched, tomorrowOnly };
}

export const syncMlbPlayerPropsNow = onCall(
  { cors: true, secrets: [ODDS_API_KEY] },
  async (req) => {
    await requireAdmin(req);
    const result = await runMlbPlayerPropsSync({
      force: true,
      tomorrowOnly: true,
    });
    return { ok: true, mode: "manual-mlb-player-props-sync", ...result };
  },
);

export const syncMlbPlayerPropsTomorrow = onSchedule(
  {
    // 12:10 AM, 8:10 AM, 11:10 AM, 2:10 PM, 5:10 PM PR
    schedule: "10 0,8,11,14,17 * * *",
    timeZone: "America/Puerto_Rico",
    secrets: [ODDS_API_KEY],
  },
  async () => {
    await runMlbPlayerPropsSync({ tomorrowOnly: true });
  },
);


export const finalizeWeeklyLeaderboardSOCCER = onSchedule(
  { schedule: "5 0 * * 0", timeZone: "America/Puerto_Rico" },
  async () => {
    const sport: Sport = "SOCCER";

    // Sunday 12:05am PR → finalize the week that ended Saturday
    const prNow = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
    );
    prNow.setDate(prNow.getDate() - 1); // go to Saturday PR
    const weekId = getWeekId(prNow);

    const lbId = leaderboardDocId(weekId, sport);
    const lbRef = db.collection("leaderboards").doc(lbId);

    const lbSnap = await lbRef.get();
    if (lbSnap.exists && (lbSnap.data() as any)?.finalized === true) return;

    const topSnap = await db
      .collection("leaderboardsEntries")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
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

    // Apply tiebreaker: points → win rate → total picks
    const { sorted: sortedDocsSOCCER, firstPlaceUids: firstPlaceUidsSOCCER } = resolveWinners(topSnap.docs);
    const winners = sortedDocsSOCCER.map((d) => ({
      uid: d.id,
      ...(d.data() as any),
    }));

    // TOP 10 leaderboard
    const top10Snap = await db
      .collection("leaderboardsEntries")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
      .orderBy("points", "desc")
      .limit(10)
      .get();

    for (const doc of top10Snap.docs) {
      const uid = (doc.data() as any).uid ?? doc.id;
      const data = doc.data() as any;
      const rank = top10Snap.docs.indexOf(doc) + 1;

      const wins = Number(data.wins ?? 0);
      const pushes = Number(data.pushes ?? 0);

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const userData = userSnap.data() as any;

      const plan = String(userData?.plan ?? "free").toLowerCase();
      const isPrem = plan === "premium";

      let rp = 0;

      if (isPrem) {
        rp += wins * 10;
        rp += pushes * 3;
      } else {
        rp += wins * 3;
        rp += pushes * 1;
      }

      // Top 10 bonus (FREE: +10, PREMIUM: +50)
      rp += isPrem ? 50 : 10;

      // Placement bonuses
      if (isPrem) {
        if (rank === 1) rp += 500;
        else if (rank === 2) rp += 200;
        else if (rank === 3) rp += 100;
      } else {
        if (firstPlaceUidsSOCCER.has(doc.id)) rp += 100;
      }

      await userRef.set(
        {
          rewardPoints: admin.firestore.FieldValue.increment(rp),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (rp > 0) {
        const rankLabel = rank === 1 ? " 🏆 #1" : rank === 2 ? " 🥈 #2" : rank === 3 ? " 🥉 #3" : ` Top ${rank}`;
        await addRewardHistoryAndNotify(
          uid,
          "leaderboard_reward",
          rp,
          `Weekly leaderboard reward — SOCCER ${weekId}${rankLabel}`,
          {
            weekId,
            sport: "SOCCER",
            wins,
            pushes,
            plan,
            rank,
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
// =============================================================================
// MLB GAME + PLAYER PROPS — PREMIUM TOURNAMENT
// Collections: player_prop_picks, player_props_leaderboard
// =============================================================================

const PROPS_POINTS_WIN  = 100;
const PROPS_POINTS_PUSH = 50;
const PROPS_POINTS_LOSS = 0;

function propsPointsForResult(result: "win" | "loss" | "push"): number {
  if (result === "win")  return PROPS_POINTS_WIN;
  if (result === "push") return PROPS_POINTS_PUSH;
  return PROPS_POINTS_LOSS;
}

/** Compute result for a player prop pick (over/under vs actual stat) */
function computePropPickResult(
  pick: any,
  game: any,
): "win" | "loss" | "push" {
  const side  = String(pick?.pick ?? pick?.selection ?? "").toLowerCase();
  const line  = typeof pick?.line === "number" ? pick.line : null;
  const market = String(pick?.market ?? "").toLowerCase();

  if (line === null) return "push";

  // Game lines (moneyline / spread / total) — reuse existing logic
  if (
    market === "moneyline_home" || market === "moneyline_away" ||
    market === "spread_home"    || market === "spread_away" ||
    market === "total_over"     || market === "total_under"
  ) {
    const homeScore = Number(game?.scoreHome ?? 0);
    const awayScore = Number(game?.scoreAway ?? 0);

    if (market === "moneyline_home" || market === "moneyline_away") {
      if (homeScore === awayScore) return "loss";
      const winner = homeScore > awayScore ? "home" : "away";
      const pickedSide = market === "moneyline_home" ? "home" : "away";
      return pickedSide === winner ? "win" : "loss";
    }

    if (market === "spread_home" || market === "spread_away") {
      const margin = homeScore - awayScore;
      const adjusted = market === "spread_home"
        ? margin + line
        : -margin + line;
      if (adjusted === 0) return "push";
      return adjusted > 0 ? "win" : "loss";
    }

    if (market === "total_over" || market === "total_under") {
      const total = homeScore + awayScore;
      if (total === line) return "push";
      if (market === "total_over")  return total > line ? "win" : "loss";
      if (market === "total_under") return total < line ? "win" : "loss";
    }

    return "push";
  }

  // Player props (pitcher / batter) — compare actual stat vs line
  const actual = Number(game?.results?.[String(pick?.playerId ?? "")] ?? -1);
  if (actual < 0) return "push"; // stat not available yet

  if (actual === line) return "push";
  if (side === "over")  return actual > line ? "win" : "loss";
  if (side === "under") return actual < line ? "win" : "loss";
  return "push";
}

/** Update player_props_leaderboard entry for a user */
async function applyPropsLeaderboard(
  tx: FirebaseFirestore.Transaction,
  pick: any,
  result: "win" | "loss" | "push",
  points: number,
) {
  const uid    = String(pick.uid    ?? "").trim();
  const weekId = String(pick.weekId ?? "").trim();
  if (!uid || !weekId) return;

  const entryRef = db
    .collection("player_props_leaderboard")
    .doc(`${weekId}_MLB_${uid}`);

  tx.set(
    entryRef,
    {
      uid,
      weekId,
      sport: "MLB",
      tournamentId: "mlb-props",
      points:     admin.firestore.FieldValue.increment(points),
      wins:       admin.firestore.FieldValue.increment(result === "win"  ? 1 : 0),
      losses:     admin.firestore.FieldValue.increment(result === "loss" ? 1 : 0),
      pushes:     admin.firestore.FieldValue.increment(result === "push" ? 1 : 0),
      totalPicks: admin.firestore.FieldValue.increment(1),
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

// ─── Place pick ───────────────────────────────────────────────────────────────

export const placePlayerPropPick = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  // Premium gate
  const userSnap = await db.collection("users").doc(uid).get();
  const plan = String((userSnap.data() as any)?.plan ?? "free").toLowerCase();
  if (plan !== "premium") {
    throw new HttpsError(
      "permission-denied",
      "This tournament is for Premium members only.",
    );
  }

  const weekId  = String(req.data?.weekId  ?? "").trim();
  const gameId  = String(req.data?.gameId  ?? "").trim();
  const market  = String(req.data?.market  ?? "").trim();
  const pick    = String(req.data?.pick    ?? "").trim().toLowerCase();
  const pickKey = String(req.data?.pickKey ?? "").trim();
  const clear   = req.data?.clear === true;

  if (!weekId || !gameId || !market || !pickKey) {
    throw new HttpsError("invalid-argument", "weekId, gameId, market and pickKey are required.");
  }

  if (!clear && pick !== "over" && pick !== "under" && pick !== "home" && pick !== "away") {
    throw new HttpsError("invalid-argument", "pick must be over/under/home/away.");
  }

  // Check game exists and is not locked
  const gameSnap = await db.collection("player_props_games").doc(gameId).get();
  if (!gameSnap.exists) {
    throw new HttpsError("not-found", "Game not found.");
  }
  const game = gameSnap.data() as any;
  const status    = String(game?.status ?? "").toLowerCase();
  const startTime: Date | null = game?.startTime?.toDate?.() ?? null;
  const now = new Date();

  if (status === "inprogress" || status === "final") {
    throw new HttpsError("failed-precondition", "Picks are locked (game started).");
  }
  if (startTime instanceof Date && !Number.isNaN(startTime.getTime()) && startTime <= now) {
    throw new HttpsError("failed-precondition", "Picks are locked (tip-off).");
  }

  const pickRef = db.collection("player_prop_picks").doc(`${uid}_${weekId}_MLB_${pickKey}`);

  if (clear) {
    await pickRef.delete().catch(() => {});
    return { ok: true, cleared: true };
  }

  const line = typeof req.data?.line === "number" ? Number(req.data.line) : null;

  await pickRef.set(
    {
      uid,
      weekId,
      sport:       "MLB",
      tournamentId:"mlb-props",
      gameId,
      pickKey,
      market,
      pick,
      selection:   pick,
      line,
      // player prop extra fields (optional)
      playerId:    String(req.data?.playerId    ?? ""),
      playerName:  String(req.data?.playerName  ?? ""),
      playerRole:  String(req.data?.playerRole  ?? ""),
      team:        String(req.data?.team        ?? ""),
      result:      "pending",
      pointsAwarded: 0,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true, pickKey };
});

// ─── Resolve picks when player_props_games doc becomes final ─────────────────

export const onPlayerPropsGameWriteResolvePicks = onDocumentWritten(
  "player_props_games/{docId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const game   = after.data() as any;
    const status = String(game?.status ?? "").toLowerCase();
    if (status !== "final") return;

    const gameId = String(game?.gameId ?? after.id).trim();
    const weekId = String(game?.weekId ?? "").trim();
    if (!gameId || !weekId) return;

    const picksSnap = await db
      .collection("player_prop_picks")
      .where("sport",  "==", "MLB")
      .where("weekId", "==", weekId)
      .where("gameId", "==", gameId)
      .get();

    if (picksSnap.empty) return;

    await db.runTransaction(async (tx) => {
      for (const docSnap of picksSnap.docs) {
        const pick   = docSnap.data() as any;
        const result = computePropPickResult(pick, game);
        const points = propsPointsForResult(result);

        const alreadyDone =
          pick.result === result && pick.pointsAwarded === points;
        if (alreadyDone) continue;

        const wasPending = String(pick.result ?? "pending") === "pending";

        tx.set(
          docSnap.ref,
          {
            result,
            pointsAwarded: points,
            resolvedAt:    admin.firestore.FieldValue.serverTimestamp(),
            updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        if (wasPending) {
          await applyPropsLeaderboard(tx, pick, result, points);
        }
      }
    });
  },
);

// ─── Finalize weekly rewards (Sunday 12:05am PR) ──────────────────────────────

async function runFinalizeMLBPropsRewards(weekId: string, force = false) {
  const lbRef = db
    .collection("player_props_leaderboard")
    .doc(`finalized_${weekId}_MLB`);

  const lbSnap = await lbRef.get();
  if (!force && lbSnap.exists && (lbSnap.data() as any)?.finalized === true) {
    return { ok: false, reason: "already-finalized" };
  }

  const entriesSnap = await db
    .collection("player_props_leaderboard")
    .where("weekId",       "==", weekId)
    .where("sport",        "==", "MLB")
    .where("tournamentId", "==", "mlb-props")
    .orderBy("points", "desc")
    .get();

  if (entriesSnap.empty) {
    await lbRef.set(
      { weekId, sport: "MLB", finalized: true, finalizedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { ok: true, reason: "no-entries", rewarded: 0 };
  }

  // Apply tiebreaker
  const { sorted } = resolveWinners(entriesSnap.docs);
  const top10 = sorted.slice(0, 10);
  let rewarded = 0;

  for (const doc of top10) {
    const data = doc.data() as any;
    const uid  = String(data.uid ?? doc.id).trim();
    if (!uid) continue;
    const rank = top10.indexOf(doc) + 1;

    const wins   = Number(data.wins   ?? 0);
    const pushes = Number(data.pushes ?? 0);

    const userRef  = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const plan = String((userSnap.data() as any)?.plan ?? "free").toLowerCase();

    // Only premium members are in this tournament
    let rp = 0;
    rp += wins   * 10;
    rp += pushes * 3;
    rp += 50; // top10 bonus premium (20 → 50)

    // Placement bonuses premium
    if (rank === 1) rp += 500;
    else if (rank === 2) rp += 200;
    else if (rank === 3) rp += 100;

    await userRef.set(
      {
        rewardPoints: admin.firestore.FieldValue.increment(rp),
        updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (rp > 0) {
      await addRewardHistoryAndNotify(
        uid,
        "leaderboard_reward",
        rp,
        `MLB Props Weekly reward — ${weekId}`,
        { weekId, sport: "MLB", tournamentId: "mlb-props", wins, pushes, plan },
      );
    }

    rewarded++;
  }

  const winnersData = sorted.slice(0, 3).map((d) => ({
    uid: (d.data() as any).uid ?? d.id,
    ...(d.data() as any),
  }));

  await lbRef.set(
    {
      weekId,
      sport: "MLB",
      tournamentId: "mlb-props",
      finalized:    true,
      finalizedAt:  admin.firestore.FieldValue.serverTimestamp(),
      winners:      winnersData,
    },
    { merge: true },
  );

  return { ok: true, weekId, rewarded, winners: winnersData.length };
}

export const finalizeMLBPropsWeeklyRewards = onSchedule(
  { schedule: "5 0 * * 0", timeZone: "America/Puerto_Rico" },
  async () => {
    const prNow = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
    );
    prNow.setDate(prNow.getDate() - 1); // Saturday
    const weekId = getWeekId(prNow);
    await runFinalizeMLBPropsRewards(weekId);
  },
);

export const adminFinalizeMLBPropsRewards = onCall({ cors: true }, async (req) => {
  await requireAdmin(req);
  const weekId = String(req.data?.weekId ?? "").trim();
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    throw new HttpsError("invalid-argument", 'weekId inválido. Usa formato "2026-W15".');
  }
  const force = req.data?.force === true;
  const result = await runFinalizeMLBPropsRewards(weekId, force);
  return result;
});
// ─── Admin: Rescore ALL Soccer picks for a week (retroactive fix) ─────────────
export const adminRescoreSoccerWeek = onCall({ cors: true }, async (req) => {
  await requireAdmin(req);

  const weekId = String(req.data?.weekId ?? "").trim();
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    throw new HttpsError("invalid-argument", 'weekId inválido. Usa formato "2026-W15".');
  }

  // 1. Get all FINAL soccer games for the week
  const gamesSnap = await db
    .collection("games")
    .where("sport", "==", "SOCCER")
    .where("weekId", "==", weekId)
    .where("status", "==", "final")
    .get();

  if (gamesSnap.empty) {
    return { ok: true, gamesProcessed: 0, picksRescored: 0 };
  }

  let gamesProcessed = 0;
  let picksRescored = 0;

  for (const gameDoc of gamesSnap.docs) {
    const game = gameDoc.data() as any;
    const gameId = String(game.gameId ?? "").trim();
    if (!gameId) continue;

    // Get all picks for this game
    const picksSnap = await db
      .collection("picks")
      .where("sport", "==", "SOCCER")
      .where("weekId", "==", weekId)
      .where("gameId", "==", gameId)
      .get();

    if (picksSnap.empty) continue;

    await db.runTransaction(async (tx) => {
      for (const pickDoc of picksSnap.docs) {
        const pick = pickDoc.data() as any;
        const result = computePickResult(game, pick);
        const points = pointsForResult(result);

        const alreadyApplied = pick.leaderboardApplied === true;

        tx.set(pickDoc.ref, {
          result,
          pointsAwarded: points,
          leaderboardApplied: true,
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // Only apply to leaderboard if not already applied
        if (!alreadyApplied) {
          applyLeaderboardForPickTx(tx, pick, result as any, points);
          picksRescored++;
        }
      }
    });

    gamesProcessed++;
  }

  return { ok: true, weekId, gamesProcessed, picksRescored };
});
// ═══════════════════════════════════════════════════════════════════════════════
// PAID TOURNAMENTS
// ─────────────────────────────────────────────────────────────────────────────
// Flow:
//   1. Admin creates paid_tournaments/{id} doc in Firestore
//   2. User calls createPaidTournamentCheckout → gets Stripe Checkout URL
//   3. User pays in Safari → Stripe webhook confirms → entry marked "paid"
//   4. scheduledCheckPaidTournamentDeadlines runs hourly:
//        - if deadline passed & participants < minPlayers → cancel + refund all
//        - if participants >= minPlayers → lock tournament
//   5. Admin calls adminFinalizePaidTournament to distribute prizes
// ═══════════════════════════════════════════════════════════════════════════════

import Stripe from "stripe";
import { onRequest } from "firebase-functions/v2/https";

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

// ── Helper: get Stripe instance ──────────────────────────────────────────────
function getStripe() {
  return new Stripe(STRIPE_SECRET_KEY.value(), { apiVersion: "2025-04-30.basil" as any });
}

// ── (1) Create Stripe Checkout Session ──────────────────────────────────────
export const createPaidTournamentCheckout = onCall(
  { cors: true, secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = requireAuth(req);
    const tournamentId = String(req.data?.tournamentId ?? "").trim();
    if (!tournamentId) throw new HttpsError("invalid-argument", "tournamentId is required.");

    // Load tournament
    const tRef = db.collection("paid_tournaments").doc(tournamentId);
    const tSnap = await tRef.get();
    if (!tSnap.exists) throw new HttpsError("not-found", "Tournament not found.");
    const t = tSnap.data() as any;

    if (t.status !== "open") throw new HttpsError("failed-precondition", `Tournament is ${t.status}.`);

    // Block if tournament already started
    const startDate = t.startDate?.toDate?.() ?? null;
    if (startDate && new Date() > startDate) {
      throw new HttpsError("failed-precondition", "El torneo ya comenzó. El registro está cerrado.");
    }

    if (t.maxPlayers && t.participantCount >= t.maxPlayers) throw new HttpsError("failed-precondition", "Tournament is full.");

    // Check if already entered
    const entryRef = db.collection("paid_tournament_entries").doc(`${tournamentId}_${uid}`);
    const entrySnap = await entryRef.get();
    if (entrySnap.exists) {
      const e = entrySnap.data() as any;
      if (e.paymentStatus === "paid") throw new HttpsError("already-exists", "Ya estás inscrito en este torneo.");
    }

    // Get user info
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data() as any ?? {};
    const displayName = userData.displayName ?? userData.username ?? uid;
    const email = userData.email ?? undefined;

    const stripe = getStripe();

    const successUrl = String(req.data?.successUrl ?? `https://stat2win.app/tournaments/paid/${tournamentId}?entry=success`);
    const cancelUrl  = String(req.data?.cancelUrl  ?? `https://stat2win.app/tournaments/paid/${tournamentId}?entry=cancelled`);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Number(t.entryFee ?? 500), // cents
          product_data: {
            name: t.title ?? "Paid Tournament Entry",
            description: `Entrada al torneo ${t.title ?? ""} — Stat2Win`,
          },
        },
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: email,
      metadata: {
        tournamentId,
        uid,
        displayName,
      },
    });

    // Create pending entry
    await entryRef.set({
      tournamentId,
      uid,
      displayName,
      username: userData.username ?? null,
      paymentStatus: "pending",
      stripeSessionId: session.id,
      amountPaid: 0,
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { ok: true, url: session.url, sessionId: session.id };
  }
);

// ── (2) Stripe Webhook ───────────────────────────────────────────────────────
export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"] as string;

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(
        (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body)),
        sig,
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (err: any) {
      console.error("Webhook signature failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      if (session.payment_status !== "paid") { res.json({ received: true }); return; }

      const { tournamentId, uid } = session.metadata ?? {};
      if (!tournamentId || !uid) { res.json({ received: true }); return; }

      const entryRef = db.collection("paid_tournament_entries").doc(`${tournamentId}_${uid}`);
      const tRef     = db.collection("paid_tournaments").doc(tournamentId);

      await db.runTransaction(async tx => {
        const entrySnap = await tx.get(entryRef);
        const tSnap     = await tx.get(tRef);
        if (!tSnap.exists) return;

        const alreadyPaid = entrySnap.exists && entrySnap.data()?.paymentStatus === "paid";
        if (alreadyPaid) return; // idempotent

        tx.set(entryRef, {
          paymentStatus: "paid",
          stripePaymentIntentId: session.payment_intent ?? null,
          amountPaid: session.amount_total ?? 0,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        tx.set(tRef, {
          participantCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      console.log(`[stripeWebhook] Entry confirmed: ${tournamentId}_${uid}`);
    }

    if (event.type === "charge.refunded") {
      // Optionally track refunds
    }

    res.json({ received: true });
  }
);

// ── (3) Scheduled: check deadlines hourly ────────────────────────────────────
export const scheduledCheckPaidTournamentDeadlines = onSchedule(
  { schedule: "every 60 minutes", timeZone: "America/Puerto_Rico" },
  async () => {
    const now = new Date();
    const stripe = getStripe();

    // Find open tournaments whose deadline has passed
    const snap = await db.collection("paid_tournaments")
      .where("status", "==", "open")
      .get();

    for (const tDoc of snap.docs) {
      const t = tDoc.data() as any;
      const deadline = t.deadline?.toDate?.() ?? null;
      if (!deadline || now < deadline) continue;

      const participants = Number(t.participantCount ?? 0);
      const minPlayers   = Number(t.minPlayers ?? 50);

      if (participants < minPlayers) {
        // Cancel tournament and refund all paid entries
        console.log(`[deadlineCheck] Cancelling ${tDoc.id} — ${participants}/${minPlayers} players`);

        await tDoc.ref.set({ status: "cancelled", cancelledAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

        const entriesSnap = await db.collection("paid_tournament_entries")
          .where("tournamentId", "==", tDoc.id)
          .where("paymentStatus", "==", "paid")
          .get();

        for (const eDoc of entriesSnap.docs) {
          const entry = eDoc.data() as any;
          const paymentIntentId = entry.stripePaymentIntentId;
          if (!paymentIntentId) continue;
          try {
            await stripe.refunds.create({ payment_intent: paymentIntentId });
            await eDoc.ref.set({
              paymentStatus: "refunded",
              refundedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            console.log(`[deadlineCheck] Refunded ${eDoc.id}`);
          } catch (err: any) {
            console.error(`[deadlineCheck] Refund failed for ${eDoc.id}:`, err.message);
          }
        }
      } else {
        // Lock tournament — minimum reached
        console.log(`[deadlineCheck] Locking ${tDoc.id} — ${participants} players confirmed`);
        await tDoc.ref.set({ status: "locked", lockedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }
);

// ── (4) Admin: finalize paid tournament — distribute prizes ──────────────────
export const adminFinalizePaidTournament = onCall(
  { cors: true, secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    const uid = requireAuth(req);

    // Verify admin
    const userSnap = await db.collection("users").doc(uid).get();
    if (!(userSnap.data() as any)?.isAdmin) throw new HttpsError("permission-denied", "Admins only.");

    const tournamentId = String(req.data?.tournamentId ?? "").trim();
    if (!tournamentId) throw new HttpsError("invalid-argument", "tournamentId required.");

    const tRef  = db.collection("paid_tournaments").doc(tournamentId);
    const tSnap = await tRef.get();
    if (!tSnap.exists) throw new HttpsError("not-found", "Tournament not found.");
    const t = tSnap.data() as any;

    if (t.status === "finished") throw new HttpsError("failed-precondition", "Already finalized.");
    if (t.status === "cancelled") throw new HttpsError("failed-precondition", "Tournament was cancelled.");

    // prizes in cents e.g. [10000, 5000, 2500]
    const prizes: number[] = t.prizes ?? [10000, 5000, 2500];

    // Load leaderboard entries for this tournament (picks stored in picks_weekly)
    // Top 3 by points → win rate → total picks
    const weekId = String(t.weekId ?? "");
    const sport  = String(t.sport ?? "NBA");

    const picksSnap = await db.collection("picks_weekly")
      .where("weekId", "==", weekId)
      .where("sport", "==", sport)
      .get();

    // Only count paid entrants
    const entriesSnap = await db.collection("paid_tournament_entries")
      .where("tournamentId", "==", tournamentId)
      .where("paymentStatus", "==", "paid")
      .get();
    const paidUids = new Set(entriesSnap.docs.map(d => d.data().uid));

    // Aggregate picks per uid
    const playerMap = new Map<string, { uid: string; points: number; wins: number; losses: number; pushes: number }>();
    for (const p of picksSnap.docs) {
      const d = p.data() as any;
      if (!paidUids.has(d.uid)) continue;
      const e = playerMap.get(d.uid) ?? { uid: d.uid, points: 0, wins: 0, losses: 0, pushes: 0 };
      e.points += Number(d.points ?? 0);
      if (d.result === "win")  { e.wins++;   }
      if (d.result === "loss") { e.losses++; }
      if (d.result === "push") { e.pushes++; }
      playerMap.set(d.uid, e);
    }

    const ranked = [...playerMap.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const wrA = (a.wins + a.losses + a.pushes) > 0 ? a.wins / (a.wins + a.losses + a.pushes) : 0;
      const wrB = (b.wins + b.losses + b.pushes) > 0 ? b.wins / (b.wins + b.losses + b.pushes) : 0;
      if (wrB !== wrA) return wrB - wrA;
      return (b.wins + b.losses + b.pushes) - (a.wins + a.losses + a.pushes);
    });

    // Mark prizes on entry docs
    const results: { uid: string; rank: number; prizeAmountCents: number }[] = [];
    for (let i = 0; i < Math.min(ranked.length, prizes.length); i++) {
      const player = ranked[i];
      const prize  = prizes[i] ?? 0;
      if (prize <= 0) continue;

      await db.collection("paid_tournament_entries")
        .doc(`${tournamentId}_${player.uid}`)
        .set({
          prizeAmountCents: prize,
          prizeRank: i + 1,
          prizeStatus: "pending_payout",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

      results.push({ uid: player.uid, rank: i + 1, prizeAmountCents: prize });
    }

    // Mark tournament finished
    await tRef.set({
      status: "finished",
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      finalRanking: ranked.slice(0, 10).map((p, i) => ({ uid: p.uid, rank: i + 1, points: p.points })),
    }, { merge: true });

    return { ok: true, prizesPending: results };
  }
);

// ── (5) Get paid tournament details (public + my entry) ──────────────────────
export const getPaidTournament = onCall({ cors: true }, async (req) => {
  const uid = req.auth?.uid ?? null;
  const tournamentId = String(req.data?.tournamentId ?? "").trim();
  if (!tournamentId) throw new HttpsError("invalid-argument", "tournamentId required.");

  const tSnap = await db.collection("paid_tournaments").doc(tournamentId).get();
  if (!tSnap.exists) throw new HttpsError("not-found", "Not found.");

  const tournament = { id: tSnap.id, ...tSnap.data() };

  let myEntry = null;
  if (uid) {
    const eSnap = await db.collection("paid_tournament_entries").doc(`${tournamentId}_${uid}`).get();
    if (eSnap.exists) myEntry = eSnap.data();
  }

  return { ok: true, tournament, myEntry };
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAID MLB TOURNAMENT — AUTO-CREATE (weekly schedule + admin manual trigger)
// ─────────────────────────────────────────────────────────────────────────────
// Tournament window: Sunday 12:00am PR → Saturday 11:59:59pm PR (same as weekly)
// Registration deadline: Saturday 11:59:59pm PR (same as end — users can pay all week)
// Entry: $5 · Min 50 players · Prizes: $100 / $50 / $25
// ═══════════════════════════════════════════════════════════════════════════════

// ── Week helpers (mirrors lib/week.ts, usable in Node) ────────────────────────

function getPRMidnight(date: Date): Date {
  const prStr = date.toLocaleDateString("en-US", {
    timeZone: "America/Puerto_Rico",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const [m, d, y] = prStr.split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 4, 0, 0, 0)); // midnight PR = UTC-4 → 04:00 UTC
}

function getWeekStartSundayPR(date = new Date()): Date {
  const midnight = getPRMidnight(date);
  const prDayStr = date.toLocaleDateString("en-US", {
    timeZone: "America/Puerto_Rico", weekday: "short",
  });
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[prDayStr] ?? 0;
  const start = new Date(midnight);
  start.setUTCDate(start.getUTCDate() - dayOfWeek);
  return start;
}

function getWeekIdPR(date = new Date()): string {
  const start = getWeekStartSundayPR(date);
  const prYear = Number(
    start.toLocaleDateString("en-US", { timeZone: "America/Puerto_Rico", year: "numeric" })
  );
  const jan1 = new Date(Date.UTC(prYear, 0, 1, 4, 0, 0, 0));
  const firstSunday = getWeekStartSundayPR(jan1);
  const diffDays = Math.floor((start.getTime() - firstSunday.getTime()) / 86400000);
  const weekNo = Math.floor(diffDays / 7) + 1;
  return `${prYear}-W${String(weekNo).padStart(2, "0")}`;
}

// ── Build the Firestore document for a paid MLB tournament ────────────────────

function buildPaidMLBTournamentDoc(weekStart: Date): Record<string, any> {
  const weekId = getWeekIdPR(weekStart);
  const weekNum = weekId.split("-W")[1];

  // startDate = Sunday 12:00am PR = 04:00 UTC (weekStart is already at 04:00 UTC)
  const startDate = new Date(weekStart);

  // endDate + deadline = Saturday 11:59:59pm PR = next-Sunday 03:59:59 UTC
  // weekStart = Sunday 04:00 UTC; +7 days = next Sunday 04:00 UTC;
  // then back 4 minutes+1s → Sunday 03:59:59 UTC = Saturday 11:59:59pm PR ✓
  const endDate = new Date(weekStart);
  endDate.setUTCDate(weekStart.getUTCDate() + 7); // next Sunday 04:00 UTC
  endDate.setUTCHours(3, 59, 59, 999);            // → Saturday 11:59:59pm PR

  return {
    title: `MLB Paid · Semana ${weekNum}`,
    sport: "MLB",
    weekId,
    entryFee: 500,                   // $5 in cents
    minPlayers: 50,
    maxPlayers: 500,
    prizes: [10000, 5000, 2500],     // $100 · $50 · $25 in cents
    status: "open",
    participantCount: 0,
    deadline: admin.firestore.Timestamp.fromDate(endDate),   // Sab 11:59pm PR
    startDate: admin.firestore.Timestamp.fromDate(startDate), // Dom 12:00am PR
    endDate: admin.firestore.Timestamp.fromDate(endDate),    // Sab 11:59pm PR
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// ── Scheduled: auto-create every Sunday at 12:01am PR ────────────────────────

export const scheduledCreateWeeklyPaidMLBTournament = onSchedule(
  { schedule: "1 4 * * 0", timeZone: "UTC" }, // 04:01 UTC Sunday = 12:01am PR
  async () => {
    const weekStart = getWeekStartSundayPR(new Date());
    const weekId    = getWeekIdPR(weekStart);
    const docId     = `${weekId}_MLB_PAID`;

    const ref      = db.collection("paid_tournaments").doc(docId);
    const existing = await ref.get();
    if (existing.exists) {
      console.log(`[createPaidMLB] ${docId} already exists — skipping.`);
      return;
    }

    await ref.set(buildPaidMLBTournamentDoc(weekStart));
    console.log(`[createPaidMLB] Created ${docId}`);
  }
);

// ── Admin: manually create paid MLB tournament (current or next week) ─────────

export const adminCreatePaidMLBTournament = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);
  const userSnap = await db.collection("users").doc(uid).get();
  if (!(userSnap.data() as any)?.isAdmin) {
    throw new HttpsError("permission-denied", "Admins only.");
  }

  // which = "current" | "next"
  const which = String(req.data?.which ?? "current");
  let weekStart = getWeekStartSundayPR(new Date());
  if (which === "next") {
    const next = new Date(weekStart);
    next.setUTCDate(weekStart.getUTCDate() + 7);
    weekStart = getWeekStartSundayPR(next);
  }

  const weekId = getWeekIdPR(weekStart);
  const docId  = `${weekId}_MLB_PAID`;

  const ref      = db.collection("paid_tournaments").doc(docId);
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpsError("already-exists", `${docId} ya existe.`);
  }

  await ref.set(buildPaidMLBTournamentDoc(weekStart));
  console.log(`[adminCreatePaidMLB] Created ${docId} (which=${which})`);

  return { ok: true, docId, weekId };
});

// ── Admin: fix/overwrite dates on an existing paid tournament ─────────────────
// Useful when the doc was created manually without timestamps.
// Call from Firebase Console → Functions → adminFixPaidTournamentDates → Test
export const adminFixPaidTournamentDates = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);
  const userSnap = await db.collection("users").doc(uid).get();
  if (!(userSnap.data() as any)?.isAdmin) {
    throw new HttpsError("permission-denied", "Admins only.");
  }

  const tournamentId = String(req.data?.tournamentId ?? "").trim();
  if (!tournamentId) throw new HttpsError("invalid-argument", "tournamentId required.");

  const ref = db.collection("paid_tournaments").doc(tournamentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Tournament not found.");

  const data = snap.data() as any;
  const weekId: string = data.weekId ?? "";
  if (!weekId) throw new HttpsError("invalid-argument", "Document has no weekId.");

  // Reconstruct week boundaries from weekId (e.g. "2026-W17")
  // Find the Sunday of that week
  const [yearStr, wStr] = weekId.split("-W");
  const year = Number(yearStr);
  const weekNum = Number(wStr);

  // Jan 1 midnight PR = Jan 1 04:00 UTC
  const jan1 = new Date(Date.UTC(year, 0, 1, 4, 0, 0, 0));
  const firstSunday = getWeekStartSundayPR(jan1);

  // weekStart = firstSunday + (weekNum - 1) * 7 days
  const weekStart = new Date(firstSunday);
  weekStart.setUTCDate(firstSunday.getUTCDate() + (weekNum - 1) * 7);

  // endDate = Saturday 11:59:59pm PR = next-Sunday 03:59:59 UTC
  const endDate = new Date(weekStart);
  endDate.setUTCDate(weekStart.getUTCDate() + 7);
  endDate.setUTCHours(3, 59, 59, 999);

  await ref.set({
    startDate: admin.firestore.Timestamp.fromDate(weekStart),
    endDate:   admin.firestore.Timestamp.fromDate(endDate),
    deadline:  admin.firestore.Timestamp.fromDate(endDate),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    tournamentId,
    weekId,
    startDate: weekStart.toISOString(),
    endDate:   endDate.toISOString(),
  };
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAID MLB TOURNAMENT v2 — Saturday open, deadline = 30min before first Sunday game
// ─────────────────────────────────────────────────────────────────────────────
// Flow:
//   Saturday 8am PR  → tournament opens (status: "open")
//   Sunday           → 30min before first MLB game: deadline reached
//                      if >= 50 users paid → status: "locked" (tournament runs)
//                      if < 50 users paid  → cancel + refund all
//   Following Saturday 11:59pm PR → admin calls adminFinalizePaidTournament
// ═══════════════════════════════════════════════════════════════════════════════

// ── Helper: find first MLB game start time on a given Sunday (PR) ─────────────
async function getFirstMLBGameOnSunday(sundayStart: Date): Promise<Date | null> {
  // sundayStart = Sunday 04:00 UTC (midnight PR)
  // We look for games with startTime between Sunday 04:00 UTC and Monday 04:00 UTC
  const dayEnd = new Date(sundayStart);
  dayEnd.setUTCDate(sundayStart.getUTCDate() + 1);

  const snap = await db.collection("games")
    .where("sport", "==", "MLB")
    .where("startTime", ">=", admin.firestore.Timestamp.fromDate(sundayStart))
    .where("startTime", "<",  admin.firestore.Timestamp.fromDate(dayEnd))
    .orderBy("startTime", "asc")
    .limit(1)
    .get();

  if (snap.empty) return null;
  return (snap.docs[0].data() as any).startTime?.toDate?.() ?? null;
}

// ── Build paid MLB tournament doc (Saturday open, dynamic deadline) ────────────
async function buildPaidMLBTournamentDocV2(nextSunday: Date): Promise<Record<string, any>> {
  const weekId  = getWeekIdPR(nextSunday);
  const weekNum = weekId.split("-W")[1];

  // Opens: Saturday 8am PR = Saturday 12:00 UTC (UTC-4 → 8am PR = 12:00 UTC)
  const saturday = new Date(nextSunday);
  saturday.setUTCDate(nextSunday.getUTCDate() - 1); // day before Sunday
  saturday.setUTCHours(12, 0, 0, 0);               // 8am PR = 12:00 UTC

  // Deadline: 30min before first Sunday MLB game (fallback: Sunday 1pm PR = 17:00 UTC)
  let deadline: Date;
  const firstGame = await getFirstMLBGameOnSunday(nextSunday);
  if (firstGame) {
    deadline = new Date(firstGame.getTime() - 30 * 60 * 1000); // -30 min
  } else {
    // Fallback: Sunday 1:00pm PR = 17:00 UTC
    deadline = new Date(nextSunday);
    deadline.setUTCHours(17, 0, 0, 0);
  }

  // Tournament start = first game time (or Sunday noon PR if no games yet)
  const startDate = firstGame ?? (() => {
    const d = new Date(nextSunday);
    d.setUTCHours(16, 0, 0, 0); // noon PR
    return d;
  })();

  // Tournament end = following Saturday 11:59:59pm PR = next-next Sunday 03:59:59 UTC
  const endDate = new Date(nextSunday);
  endDate.setUTCDate(nextSunday.getUTCDate() + 7);
  endDate.setUTCHours(3, 59, 59, 999);

  return {
    title:            `MLB Paid · Semana ${weekNum}`,
    sport:            "MLB",
    weekId,
    entryFee:         500,
    minPlayers:       50,
    maxPlayers:       500,
    prizes:           [10000, 5000, 2500],
    status:           "open",
    participantCount: 0,
    openDate:  admin.firestore.Timestamp.fromDate(saturday),
    deadline:  admin.firestore.Timestamp.fromDate(deadline),
    startDate: admin.firestore.Timestamp.fromDate(startDate),
    endDate:   admin.firestore.Timestamp.fromDate(endDate),
    firstGameUsed: firstGame ? firstGame.toISOString() : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// ── Scheduled: create paid MLB tournament every Saturday 8am PR ───────────────
// cron "0 12 * * 6" UTC = every Saturday 12:00 UTC = 8am PR
export const scheduledCreateSaturdayPaidMLBTournament = onSchedule(
  { schedule: "0 12 * * 6", timeZone: "UTC" },
  async () => {
    // nextSunday = tomorrow (Saturday + 1 day)
    const now        = new Date();
    const tomorrow   = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1);
    const nextSunday = getWeekStartSundayPR(tomorrow);
    const weekId     = getWeekIdPR(nextSunday);
    const docId      = `${weekId}_MLB_PAID`;

    const ref      = db.collection("paid_tournaments").doc(docId);
    const existing = await ref.get();
    if (existing.exists) {
      console.log(`[saturdayCreate] ${docId} already exists — skipping.`);
      return;
    }

    const data = await buildPaidMLBTournamentDocV2(nextSunday);
    await ref.set(data);
    console.log(`[saturdayCreate] Created ${docId} — deadline: ${data.deadline.toDate().toISOString()}`);
  }
);

// ── Scheduled: check deadlines every 15 minutes ───────────────────────────────
export const scheduledCheckPaidTournamentDeadlines15m = onSchedule(
  { schedule: "*/15 * * * *", timeZone: "UTC" },
  async () => {
    const now    = new Date();
    const stripe = getStripe();

    const snap = await db.collection("paid_tournaments")
      .where("status", "==", "open")
      .get();

    for (const tDoc of snap.docs) {
      const t        = tDoc.data() as any;
      const deadline = t.deadline?.toDate?.() ?? null;
      if (!deadline || now < deadline) continue;

      const participants = Number(t.participantCount ?? 0);
      const minPlayers   = Number(t.minPlayers ?? 50);

      if (participants < minPlayers) {
        // Cancel + refund
        console.log(`[15mCheck] Cancelling ${tDoc.id} — ${participants}/${minPlayers}`);
        await tDoc.ref.set({
          status:      "cancelled",
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        const entriesSnap = await db.collection("paid_tournament_entries")
          .where("tournamentId", "==", tDoc.id)
          .where("paymentStatus", "==", "paid")
          .get();

        for (const eDoc of entriesSnap.docs) {
          const paymentIntentId = (eDoc.data() as any).stripePaymentIntentId;
          if (!paymentIntentId) continue;
          try {
            await stripe.refunds.create({ payment_intent: paymentIntentId });
            await eDoc.ref.set({
              paymentStatus: "refunded",
              refundedAt:    admin.firestore.FieldValue.serverTimestamp(),
              updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            console.log(`[15mCheck] Refunded ${eDoc.id}`);
          } catch (err: any) {
            console.error(`[15mCheck] Refund failed ${eDoc.id}:`, err.message);
          }
        }
      } else {
        // Lock — minimum reached, tournament starts
        console.log(`[15mCheck] Locking ${tDoc.id} — ${participants} players confirmed`);
        await tDoc.ref.set({
          status:   "locked",
          lockedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
  }
);

// ── Admin: create paid MLB tournament for next week on demand ─────────────────
export const adminCreateNextWeekPaidMLBTournament = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);
  const userSnap = await db.collection("users").doc(uid).get();
  if (!(userSnap.data() as any)?.isAdmin) {
    throw new HttpsError("permission-denied", "Admins only.");
  }

  // Next Sunday from now
  const now        = new Date();
  const tomorrow   = new Date(now);
  tomorrow.setUTCDate(now.getUTCDate() + 1);
  const nextSunday = getWeekStartSundayPR(tomorrow);
  const weekId     = getWeekIdPR(nextSunday);
  const docId      = `${weekId}_MLB_PAID`;

  const ref      = db.collection("paid_tournaments").doc(docId);
  const existing = await ref.get();
  if (existing.exists) throw new HttpsError("already-exists", `${docId} ya existe.`);

  const data = await buildPaidMLBTournamentDocV2(nextSunday);
  await ref.set(data);
  console.log(`[adminCreate] Created ${docId}`);

  return {
    ok:       true,
    docId,
    weekId,
    deadline: data.deadline.toDate().toISOString(),
    openDate: data.openDate.toDate().toISOString(),
  };
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAID TOURNAMENT PICKS  (stored in picks_paid — separate from RP picks)
// ═══════════════════════════════════════════════════════════════════════════════

export const placePaidPick = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);

  const tournamentId = String(req.data?.tournamentId ?? "").trim();
  if (!tournamentId) throw new HttpsError("invalid-argument", "tournamentId is required.");

  // Verify paid entry
  const entrySnap = await db.collection("paid_tournament_entries").doc(`${tournamentId}_${uid}`).get();
  if (!entrySnap.exists || entrySnap.data()?.paymentStatus !== "paid") {
    throw new HttpsError("failed-precondition", "Debes estar inscrito y con pago confirmado.");
  }

  // Load tournament to get sport + weekId
  const tSnap = await db.collection("paid_tournaments").doc(tournamentId).get();
  if (!tSnap.exists) throw new HttpsError("not-found", "Tournament not found.");
  const t = tSnap.data() as any;

  if (t.status === "cancelled" || t.status === "finished") {
    throw new HttpsError("failed-precondition", `Tournament is ${t.status}.`);
  }

  const sport   = String(t.sport ?? "MLB").toUpperCase();
  const weekId  = String(t.weekId ?? "").trim();
  const clear   = req.data?.clear === true;

  // Market + selection validation
  const marketRaw = String(req.data?.market ?? "").toLowerCase();
  const market = (["moneyline","spread","ou"].includes(marketRaw)) ? marketRaw : null;
  if (!market) throw new HttpsError("invalid-argument", "Invalid market.");

  const selectionRaw = String(req.data?.selection ?? req.data?.pick ?? "").toLowerCase();
  const selection = (["home","away","over","under","draw"].includes(selectionRaw)) ? selectionRaw : null;
  if (!selection && !clear) throw new HttpsError("invalid-argument", "Invalid selection.");

  // Find game
  const gameIdIn    = String(req.data?.gameId ?? "").trim();
  const gameDocIdIn = String(req.data?.gameDocId ?? "").trim();

  let gameSnap: FirebaseFirestore.DocumentSnapshot | null = null;
  if (gameDocIdIn) {
    const s = await db.collection("games").doc(gameDocIdIn).get();
    if (s.exists) gameSnap = s;
  }
  if (!gameSnap && gameIdIn) {
    const q = await db.collection("games")
      .where("sport", "==", sport)
      .where("weekId", "==", weekId)
      .where("gameId", "==", gameIdIn)
      .limit(1).get();
    if (!q.empty) gameSnap = q.docs[0];
  }
  if (!gameSnap) throw new HttpsError("not-found", "Game not found.");

  const game       = gameSnap.data() as any;
  const gameStatus = String(game?.status ?? "").toLowerCase();
  if (gameStatus === "inprogress" || gameStatus === "final") {
    throw new HttpsError("failed-precondition", "Picks are locked (game started).");
  }
  const startTime = game?.startTime?.toDate?.() ?? null;
  if (startTime instanceof Date && startTime <= new Date()) {
    throw new HttpsError("failed-precondition", "Picks are locked (game started).");
  }

  const gameIdField = String(game?.gameId ?? gameIdIn).trim();
  const pickId = `${uid}_${tournamentId}_${gameIdField}_${market}`;
  const pickRef = db.collection("picks_paid").doc(pickId);

  if (clear) {
    await pickRef.delete().catch(() => {});
    return { ok: true, cleared: true, pickId };
  }

  const line = typeof req.data?.line === "number" ? req.data.line : null;

  await pickRef.set({
    uid,
    tournamentId,
    sport,
    weekId,
    gameId:    gameIdField,
    gameDocId: gameSnap.id,
    market,
    selection,
    pick:      selection,
    line,
    result:    "pending",
    pointsAwarded: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, pickId };
});

// ═══════════════════════════════════════════════════════════════════════════════
// getPaidTournamentLeaderboard — Returns ranked participants for a paid tournament
// ═══════════════════════════════════════════════════════════════════════════════
export const getPaidTournamentLeaderboard = onCall({ cors: true }, async (req) => {
  const uid = requireAuth(req);
  const tournamentId = String(req.data?.tournamentId ?? "").trim();
  if (!tournamentId) throw new HttpsError("invalid-argument", "tournamentId requerido.");

  // Verify caller is a paid participant (or admin)
  const entryRef  = db.collection("paid_tournament_entries").doc(`${tournamentId}_${uid}`);
  const entrySnap = await entryRef.get();
  const isAdmin   = !!(req.auth?.token?.admin);
  if (!isAdmin && (!entrySnap.exists || entrySnap.data()?.paymentStatus !== "paid")) {
    throw new HttpsError("permission-denied", "Debes estar inscrito con pago confirmado para ver el leaderboard.");
  }

  // Load tournament doc for prize info
  const tSnap = await db.collection("paid_tournaments").doc(tournamentId).get();
  if (!tSnap.exists) throw new HttpsError("not-found", "Torneo no encontrado.");
  const tournament = tSnap.data() as any;

  // Aggregate all picks_paid for this tournament
  const picksSnap = await db.collection("picks_paid")
    .where("tournamentId", "==", tournamentId)
    .get();

  const userMap: Map<string, {
    uid: string;
    points: number;
    wins: number;
    losses: number;
    pushes: number;
    picks: number;
  }> = new Map();

  for (const d of picksSnap.docs) {
    const p = d.data() as any;
    const pUid = String(p.uid ?? "").trim();
    if (!pUid) continue;
    const existing = userMap.get(pUid) ?? { uid: pUid, points: 0, wins: 0, losses: 0, pushes: 0, picks: 0 };
    const result = String(p.result ?? "pending").toLowerCase();
    const pts    = typeof p.pointsAwarded === "number" ? p.pointsAwarded : 0;
    existing.points += pts;
    existing.picks  += 1;
    if (result === "win")   existing.wins   += 1;
    if (result === "loss")  existing.losses += 1;
    if (result === "push")  existing.pushes += 1;
    userMap.set(pUid, existing);
  }

  // Also include participants with 0 picks so they appear in the board
  const allEntriesSnap = await db.collection("paid_tournament_entries")
    .where("tournamentId", "==", tournamentId)
    .where("paymentStatus", "==", "paid")
    .get();
  for (const d of allEntriesSnap.docs) {
    const eUid = String(d.data()?.uid ?? "").trim();
    if (eUid && !userMap.has(eUid)) {
      userMap.set(eUid, { uid: eUid, points: 0, wins: 0, losses: 0, pushes: 0, picks: 0 });
    }
  }

  // Sort: points desc, then wins desc
  const rows = Array.from(userMap.values()).sort((a, b) =>
    b.points !== a.points ? b.points - a.points : b.wins - a.wins
  );

  // Batch-fetch display names from users collection
  const uids = rows.map(r => r.uid);
  const nameMap: Map<string, { username?: string; displayName?: string; avatarUrl?: string }> = new Map();
  const chunks: string[][] = [];
  for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));
  for (const chunk of chunks) {
    const uSnap = await db.collection("users").where(admin.firestore.FieldPath.documentId(), "in", chunk).get();
    for (const d of uSnap.docs) {
      const data = d.data() as any;
      nameMap.set(d.id, { username: data.username, displayName: data.displayName, avatarUrl: data.avatarUrl });
    }
  }

  const ranked = rows.map((r, idx) => {
    const meta = nameMap.get(r.uid) ?? {};
    return {
      rank:        idx + 1,
      uid:         r.uid,
      username:    meta.username  ?? null,
      displayName: meta.displayName ?? null,
      avatarUrl:   meta.avatarUrl ?? null,
      points:      r.points,
      wins:        r.wins,
      losses:      r.losses,
      pushes:      r.pushes,
      picks:       r.picks,
    };
  });

  return {
    tournamentId,
    tournamentTitle: tournament.title ?? "",
    prizes:          Array.isArray(tournament.prizes) ? tournament.prizes : [],
    status:          tournament.status ?? "open",
    weekId:          tournament.weekId ?? "",
    rows:            ranked,
  };
});
