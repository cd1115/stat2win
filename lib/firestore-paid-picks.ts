import {
  collection,
  onSnapshot,
  query,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
export type PaidPickResult = "pending" | "win" | "loss" | "push";

export type PaidPickDoc = {
  id?: string;

  uid: string;
  tournamentId: string;
  sport: string;
  weekId: string;

  gameId: string;
  gameDocId: string;

  market: "moneyline" | "spread" | "ou";
  pick: "home" | "away" | "over" | "under";
  selection: "HOME" | "AWAY" | "OVER" | "UNDER";
  line: number | null;

  result: PaidPickResult;
  pointsAwarded: number;

  createdAt?: any;
  updatedAt?: any;
};

// -----------------------------------------------------------------------------
// Listener – picks for a specific paid tournament by the current user
// -----------------------------------------------------------------------------
export function listenMyPaidPicksByTournament(
  uid: string,
  tournamentId: string,
  onRows: (rows: PaidPickDoc[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const q = query(
    collection(db, "picks_paid"),
    where("uid", "==", uid),
    where("tournamentId", "==", tournamentId),
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows: PaidPickDoc[] = snap.docs
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
      else console.error("listenMyPaidPicksByTournament error:", err);
    },
  );
}
