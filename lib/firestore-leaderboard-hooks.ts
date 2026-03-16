"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { getWeekId } from "@/lib/week";
import {
  listenLeaderboard,
  type LeaderboardRow,
} from "@/lib/firestore-leaderboard";
import { db } from "@/lib/firebase";
import type { Sport } from "@/lib/firestore-games";

export type LeaderboardUIRow = LeaderboardRow & {
  username: string;
  photoURL?: string;
};

type UsernameDoc = {
  username?: string;
  photoURL?: string;
};

async function fetchUsername(
  uid: string
): Promise<{ username: string; photoURL?: string }> {
  const snap = await getDoc(doc(db, "usernames", uid));
  if (!snap.exists()) return { username: "—" };

  const d = snap.data() as UsernameDoc;
  return {
    username: String(d.username ?? "—"),
    photoURL: d.photoURL,
  };
}

export function useLeaderboard(params?: { weekId?: string; sport?: Sport }) {
  const weekId = params?.weekId ?? getWeekId();
  const sport: Sport = params?.sport ?? "NBA";

  const [data, setData] = useState<LeaderboardUIRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, { username: string; photoURL?: string }>>(
    new Map()
  );

  const key = useMemo(() => `${weekId}_${sport}`, [weekId, sport]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsub = listenLeaderboard(
      weekId,
      sport,
      async (rows) => {
        try {
          const missing = rows
            .map((r) => r.uid)
            .filter((uid) => uid && !cacheRef.current.has(uid));

          if (missing.length > 0) {
            const fetched = await Promise.all(
              missing.map(async (uid) => [uid, await fetchUsername(uid)] as const)
            );
            fetched.forEach(([uid, u]) => cacheRef.current.set(uid, u));
          }

          const merged: LeaderboardUIRow[] = rows.map((r) => {
            const u = cacheRef.current.get(r.uid);
            return {
              ...r,
              username: u?.username ?? "—",
              photoURL: u?.photoURL,
            };
          });

          setData(merged);
          setLoading(false);
        } catch (e: any) {
          setError(e?.message || "Error uniendo usernames");
          setLoading(false);
        }
      },
      (msg) => {
        setError(msg);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [key, weekId, sport]);

  return { data, loading, error, weekId, sport };
}