import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Sport } from "@/lib/firestore-games";

function leaderboardDocId(weekId: string, sport: Sport) {
  return `${weekId}_${sport}`;
}

export type LeaderboardRow = {
  uid: string;
  weekId: string;
  sport: Sport;
  points: number;
};

export function listenLeaderboard(
  weekId: string,
  sport: Sport,
  onData: (rows: LeaderboardRow[]) => void,
  onError?: (msg: string) => void
): Unsubscribe {
  const lbId = leaderboardDocId(weekId, sport);

  const q = query(
    collection(db, "leaderboards", lbId, "users"),
    orderBy("points", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows: LeaderboardRow[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          uid: data.uid ?? d.id,
          weekId: data.weekId ?? weekId,
          sport: (data.sport ?? sport) as Sport,
          points: Number(data.points ?? 0),
        };
      });
      onData(rows);
    },
    (err) => onError?.(err.message)
  );
}