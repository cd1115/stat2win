// /lib/firestore-picks-daily.ts
// Daily picks — same structure as weekly picks but keyed by dayId instead of weekId.
// Collection: "picks_daily"

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { Sport } from "@/lib/firestore-games";
import { normalizeGameId } from "@/lib/firestore-picks";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
export type Market = "moneyline" | "spread" | "ou";
export type PickSide = "home" | "away" | "over" | "under";
export type PickResult = "pending" | "win" | "loss" | "push";

export type DailyPickDoc = {
  id?: string;

  uid: string;
  sport: Sport;
  /** "YYYY-MM-DD" in Puerto Rico timezone */
  dayId: string;
  gameId: string;

  market: Market;
  pick: PickSide;
  selection?: "HOME" | "AWAY" | "OVER" | "UNDER" | null;
  line?: number | null;

  username?: string | null;
  displayName?: string | null;

  result?: PickResult;
  pointsAwarded?: number;
  resolvedAt?: any | null;

  createdAt?: any;
  updatedAt?: any;
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
export function dailyPickDocId(
  uid: string,
  sport: Sport,
  dayId: string,
  gameId: string,
  market: Market,
): string {
  return `${uid}_${String(sport).toUpperCase()}_${dayId}_${gameId}_${market}`;
}

// -----------------------------------------------------------------------------
// LISTENER — My picks for a given day (all sports)
// -----------------------------------------------------------------------------
export function listenMyDailyPicksByDay(
  uid: string,
  dayId: string,
  onRows: (rows: DailyPickDoc[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const q = query(
    collection(db, "picks_daily"),
    where("uid", "==", uid),
    where("dayId", "==", dayId),
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows: DailyPickDoc[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .sort((a, b) => {
          const at = (a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0) as number;
          const bt = (b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) as number;
          return bt - at;
        });
      onRows(rows);
    },
    (err) => {
      if (onError) onError(err);
      else console.error("listenMyDailyPicksByDay error:", err);
    },
  );
}

// -----------------------------------------------------------------------------
// LISTENER — My picks for a given day filtered by sport
// -----------------------------------------------------------------------------
export function listenMyDailyPicksByDayAndSport(
  uid: string,
  dayId: string,
  sport: Sport,
  onRows: (rows: DailyPickDoc[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const q = query(
    collection(db, "picks_daily"),
    where("uid", "==", uid),
    where("dayId", "==", dayId),
    where("sport", "==", sport),
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows: DailyPickDoc[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .sort((a, b) => {
          const at = (a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0) as number;
          const bt = (b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) as number;
          return bt - at;
        });
      onRows(rows);
    },
    (err) => {
      if (onError) onError(err);
      else console.error("listenMyDailyPicksByDayAndSport error:", err);
    },
  );
}

// -----------------------------------------------------------------------------
// LISTENER — Leaderboard for a given day
// -----------------------------------------------------------------------------
export type DailyLeaderboardEntry = {
  uid: string;
  displayName?: string | null;
  username?: string | null;
  totalPoints: number;
  wins: number;
  losses: number;
  pushes: number;
  totalPicks: number;
};

export function listenDailyLeaderboard(
  dayId: string,
  onRows: (rows: DailyLeaderboardEntry[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  // Query all resolved picks for the day, then aggregate client-side
  const q = query(
    collection(db, "picks_daily"),
    where("dayId", "==", dayId),
  );

  return onSnapshot(
    q,
    (snap) => {
      const byUser = new Map<string, DailyLeaderboardEntry>();

      for (const d of snap.docs) {
        const p = d.data() as DailyPickDoc;
        if (!p.uid) continue;

        const existing = byUser.get(p.uid) ?? {
          uid: p.uid,
          displayName: p.displayName ?? null,
          username: p.username ?? null,
          totalPoints: 0,
          wins: 0,
          losses: 0,
          pushes: 0,
          totalPicks: 0,
        };

        existing.totalPicks += 1;

        if (p.result === "win") {
          existing.wins += 1;
          existing.totalPoints += p.pointsAwarded ?? 100;
        } else if (p.result === "push") {
          existing.pushes += 1;
          existing.totalPoints += p.pointsAwarded ?? 50;
        } else if (p.result === "loss") {
          existing.losses += 1;
        }

        // keep latest display name
        if (p.displayName) existing.displayName = p.displayName;
        if (p.username) existing.username = p.username;

        byUser.set(p.uid, existing);
      }

      const rows = Array.from(byUser.values()).sort(
        (a, b) => b.totalPoints - a.totalPoints,
      );

      onRows(rows);
    },
    (err) => {
      if (onError) onError(err);
      else console.error("listenDailyLeaderboard error:", err);
    },
  );
}

// -----------------------------------------------------------------------------
// MUTATIONS
// -----------------------------------------------------------------------------
export async function upsertDailyPick(args: {
  uid: string;
  sport: Sport;
  dayId: string;
  gameId: string | number;
  market: Market;
  pick: PickSide;
  selection?: "HOME" | "AWAY" | "OVER" | "UNDER";
  line?: number | null;
  username?: string;
  displayName?: string;
}) {
  const uid = String(args.uid || "").trim();
  if (!uid) throw new Error("Invalid uid for daily pick.");

  const dayId = String(args.dayId || "").trim();
  if (!dayId) throw new Error("Invalid dayId for daily pick.");

  const gameId = normalizeGameId(args.gameId);
  if (!gameId) {
    throw new Error(`Invalid gameId for daily pick: "${String(args.gameId ?? "")}"`);
  }

  const id = dailyPickDocId(uid, args.sport, dayId, gameId, args.market);
  const ref = doc(db, "picks_daily", id);
  const snap = await getDoc(ref);
  const exists = snap.exists();

  const baseData: Omit<DailyPickDoc, "id"> = {
    uid,
    sport: args.sport,
    dayId,
    gameId,
    market: args.market,
    pick: args.pick,
    selection: args.selection ?? null,
    line: args.line ?? null,
    username: args.username ?? null,
    displayName: args.displayName ?? null,
    updatedAt: serverTimestamp(),
  };

  if (!exists) {
    await setDoc(
      ref,
      {
        ...baseData,
        createdAt: serverTimestamp(),
        result: "pending" as PickResult,
        pointsAwarded: 0,
        resolvedAt: null,
      },
      { merge: true },
    );
    return;
  }

  await setDoc(ref, baseData, { merge: true });
}

export async function deleteDailyPickForMarket(args: {
  uid: string;
  sport: Sport;
  dayId: string;
  gameId: string | number;
  market: Market;
}) {
  const uid = String(args.uid || "").trim();
  const dayId = String(args.dayId || "").trim();
  if (!uid || !dayId) return;

  const gameId = normalizeGameId(args.gameId);
  if (!gameId) return;

  const id = dailyPickDocId(uid, args.sport, dayId, gameId, args.market);
  await deleteDoc(doc(db, "picks_daily", id));
}
