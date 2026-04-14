// /lib/firestore-games-daily.ts
// Queries games from all active sports whose startTime falls on a given dayId.
// Uses the existing "games" collection — no new collection needed.

"use client";

import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import type { GameDoc, Sport } from "@/lib/firestore-games";
import { isGameOnDay, getDayId } from "@/lib/day";

export type { GameDoc, Sport };

const ACTIVE_SPORTS: Sport[] = ["NBA", "MLB"];

// Re-export so consumers don't need to import from two places
export { ACTIVE_SPORTS };

/**
 * Listens to all games across all active sports for a given weekId,
 * then filters client-side to only games on dayId.
 *
 * Why weekId? Games are stored by weekId in Firestore.
 * We fetch the whole week and filter by day client-side.
 */
export function listenGamesByDay(
  weekId: string,
  dayId: string,
  onRows: (rows: GameDoc[]) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  const allGames = new Map<Sport, GameDoc[]>();
  const unsubs: Unsubscribe[] = [];

  function emit() {
    const merged: GameDoc[] = [];
    for (const games of allGames.values()) {
      merged.push(...games);
    }
    // Filter to only games on this day, sort by startTime
    const filtered = merged
      .filter((g) => isGameOnDay(g.startTime, dayId))
      .sort((a, b) => {
        const at = a.startTime?.toMillis?.() ?? a.startTime?.toDate?.()?.getTime?.() ?? 0;
        const bt = b.startTime?.toMillis?.() ?? b.startTime?.toDate?.()?.getTime?.() ?? 0;
        return at - bt;
      });
    onRows(filtered);
  }

  for (const sport of ACTIVE_SPORTS) {
    allGames.set(sport, []);

    const q = query(
      collection(db, "games"),
      where("sport", "==", sport),
      where("weekId", "==", weekId),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: GameDoc[] = snap.docs.map((d) => {
          const data = d.data() as any;

          const homeTeam = String(data.homeTeam ?? data.home ?? "").trim();
          const awayTeam = String(data.awayTeam ?? data.away ?? "").trim();
          const startTime = data.startTime ?? data.startAt ?? data.startsAt ?? undefined;

          const normalizeStatus = (s: any) => {
            const v = String(s ?? "").toLowerCase();
            if (v === "final") return "final" as const;
            if (v === "inprogress" || v === "in_progress" || v === "live" || v === "closed")
              return "inprogress" as const;
            return "scheduled" as const;
          };

          const coerce = (v: any) => {
            if (typeof v === "number" && Number.isFinite(v)) return v;
            if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
            return undefined;
          };

          const spread = data?.markets?.spread ?? data?.markets?.sp;
          const total = data?.markets?.total ?? data?.markets?.totals ?? data?.markets?.ou;
          const moneyline = data?.markets?.moneyline ?? data?.markets?.ml;

          const homeLine = coerce(spread?.homeLine) ?? coerce(spread?.home) ?? coerce(spread?.line);
          const awayLine = coerce(spread?.awayLine) ?? coerce(spread?.away) ??
            (typeof homeLine === "number" ? -homeLine : undefined);
          const totalLine = coerce(total?.line) ?? coerce(total?.total) ?? coerce(total?.points);

          // gameId from field or docId
          const rawId = data?.gameId ?? data?.GameID ?? data?.GameId;
          let gameId: string | undefined;
          const asStr = String(rawId ?? "").trim();
          if (/^\d+$/.test(asStr) && !/^\d{13}$/.test(asStr)) {
            gameId = asStr;
          } else {
            const parts = d.id.split("_").filter(Boolean);
            const last = parts[parts.length - 1] ?? "";
            if (/^\d+$/.test(last) && !/^\d{13}$/.test(last)) gameId = last;
          }

          return {
            id: d.id,
            sport,
            weekId: String(data.weekId ?? weekId),
            gameId,
            homeTeam,
            awayTeam,
            startTime,
            status: normalizeStatus(data.status),
            scoreHome: coerce(data.scoreHome ?? data.homeScore),
            scoreAway: coerce(data.scoreAway ?? data.awayScore),
            markets: {
              ...(moneyline ? { moneyline: { home: coerce(moneyline.home), away: coerce(moneyline.away) } } : {}),
              ...(homeLine !== undefined || awayLine !== undefined
                ? { spread: { homeLine, awayLine, line: coerce(spread?.line) } }
                : {}),
              ...(totalLine !== undefined ? { total: { line: totalLine } } : {}),
            },
            updatedAt: data.updatedAt,
          } as GameDoc;
        });

        allGames.set(sport, rows);
        emit();
      },
      (err) => onError?.(err),
    );

    unsubs.push(unsub);
  }

  return () => unsubs.forEach((u) => u());
}
