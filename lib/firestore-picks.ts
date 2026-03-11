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

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
export type Market = "moneyline" | "spread" | "ou";
export type PickSide = "home" | "away" | "over" | "under";
export type PickResult = "pending" | "win" | "loss" | "push";

export type PickDoc = {
  id?: string;

  uid: string;
  sport: Sport;
  weekId: string;
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
function isEpochMs13(v: string) {
  return /^\d{13}$/.test(v);
}

export function normalizeGameId(input: string | number): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  if (isEpochMs13(raw)) return "";
  if (raw.includes("/")) return "";

  const parts = raw.split("_").filter(Boolean);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (last === "moneyline" || last === "spread" || last === "ou") {
      parts.pop();
      const joined = parts.join("_").trim();
      if (!joined) return "";
      if (isEpochMs13(joined)) return "";
      if (joined.includes("/")) return "";
      return joined;
    }
  }

  return raw;
}

export function pickDocId(
  uid: string,
  sport: Sport,
  weekId: string,
  gameId: string,
  market: Market,
) {
  return `${uid}_${String(sport).toUpperCase()}_${weekId}_${gameId}_${market}`;
}

// -----------------------------------------------------------------------------
// LISTENER (My Picks)
// -----------------------------------------------------------------------------
export function listenMyPicksByWeekAndSport(
  uid: string,
  weekId: string,
  sport: Sport,
  onRows: (rows: PickDoc[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const q = query(
    collection(db, "picks"),
    where("uid", "==", uid),
    where("weekId", "==", weekId),
    where("sport", "==", sport),
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows: PickDoc[] = snap.docs
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
      else console.error("listenMyPicksByWeekAndSport error:", err);
    },
  );
}

// -----------------------------------------------------------------------------
// MUTATIONS
// -----------------------------------------------------------------------------
export async function upsertPick(args: {
  uid: string;
  sport: Sport;
  weekId: string;
  gameId: string | number;
  market: Market;
  pick: PickSide;
  selection?: "HOME" | "AWAY" | "OVER" | "UNDER";
  line?: number | null;
  username?: string;
  displayName?: string;
}) {
  const uid = String(args.uid || "").trim();
  if (!uid) throw new Error("Invalid uid for pick.");

  const weekId = String(args.weekId || "").trim();
  if (!weekId) throw new Error("Invalid weekId for pick.");

  const sport = args.sport;
  const market = args.market;

  const gameId = normalizeGameId(args.gameId);
  if (!gameId) {
    throw new Error(`Invalid gameId for pick: "${String(args.gameId ?? "")}"`);
  }

  const id = pickDocId(uid, sport, weekId, gameId, market);
  const ref = doc(db, "picks", id);

  const snap = await getDoc(ref);
  const exists = snap.exists();

  const baseData: Omit<PickDoc, "id"> = {
    uid,
    sport,
    weekId,
    gameId,
    market,
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

export async function deletePickForMarket(args: {
  uid: string;
  sport: Sport;
  weekId: string;
  gameId: string | number;
  market: Market;
}) {
  const uid = String(args.uid || "").trim();
  const weekId = String(args.weekId || "").trim();
  if (!uid || !weekId) return;

  const gameId = normalizeGameId(args.gameId);
  if (!gameId) return;

  const id = pickDocId(uid, args.sport, weekId, gameId, args.market);
  await deleteDoc(doc(db, "picks", id));
}