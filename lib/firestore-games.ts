"use client";

import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";

export type Sport = "NBA" | "NFL" | "SOCCER" | "MLB";
export type GameStatus = "scheduled" | "inprogress" | "final";

/**
 * Canonical game shape used by the tournament UI.
 * We normalize legacy/admin-created docs (home/away/startAt/status=open|closed) into this shape.
 */
export type GameDoc = {
  id: string; // Firestore doc id
  sport: Sport;
  weekId: string;

  /** Stable provider/manual id (numeric string). Required for picks. */
  gameId?: string;

  homeTeam: string;
  awayTeam: string;

  startTime?: any;
  status: GameStatus;

  scoreHome?: number;
  scoreAway?: number;

  markets?: {
    moneyline?: { home?: number; away?: number };
    spread?: { homeLine?: number; awayLine?: number; line?: number };
    total?: { line?: number };
  };

  updatedAt?: any;
};

function isEpochMs13(v: string) {
  return /^\d{13}$/.test(v);
}

function normalizeStatus(input: any): GameStatus {
  const s = String(input ?? "").toLowerCase();
  if (s === "final") return "final";
  if (s === "inprogress" || s === "in_progress" || s === "live")
    return "inprogress";
  // legacy/admin values
  if (s === "closed") return "inprogress";
  return "scheduled";
}

function coerceNumber(v: any): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v)))
    return Number(v);
  return undefined;
}

/**
 * Accepts ONLY numeric gameIds (string/number), and rejects 13-digit epoch ms.
 * If missing, attempts to parse from docId like "NBA_2026-W08_202608001".
 */
function normalizeGameId(data: any, docId: string): string | undefined {
  const raw = data?.gameId ?? data?.GameID ?? data?.GameId ?? undefined;

  const asString = (x: any) => String(x ?? "").trim();

  // from field
  if (raw !== undefined && raw !== null) {
    const s = asString(raw);
    if (/^\d+$/.test(s) && !isEpochMs13(s)) return s;
  }

  // from docId
  const parts = String(docId || "")
    .split("_")
    .filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  if (/^\d+$/.test(last) && !isEpochMs13(last)) return last;

  return undefined;
}

export function listenGamesByWeekAndSport(
  sport: Sport,
  weekId: string,
  onRows: (rows: GameDoc[]) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  const q = query(
    collection(db, "games"),
    where("sport", "==", sport),
    where("weekId", "==", weekId),
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows: GameDoc[] = snap.docs.map((d) => {
        const data = d.data() as any;

        // normalize teams
        const homeTeam = String(data.homeTeam ?? data.home ?? "").trim();
        const awayTeam = String(data.awayTeam ?? data.away ?? "").trim();

        // normalize time field
        const startTime =
          data.startTime ?? data.startAt ?? data.startsAt ?? undefined;

        // normalize markets
        const spread = data?.markets?.spread ?? data?.markets?.sp ?? undefined;
        const total =
          data?.markets?.total ??
          data?.markets?.totals ??
          data?.markets?.ou ??
          undefined;
        const moneyline =
          data?.markets?.moneyline ?? data?.markets?.ml ?? undefined;

        const homeLine =
          coerceNumber(spread?.homeLine) ??
          coerceNumber(spread?.home) ??
          coerceNumber(spread?.lineHome) ??
          coerceNumber(spread?.line);

        const awayLine =
          coerceNumber(spread?.awayLine) ??
          coerceNumber(spread?.away) ??
          coerceNumber(spread?.lineAway) ??
          (typeof homeLine === "number" ? -homeLine : undefined);

        const totalLine =
          coerceNumber(total?.line) ??
          coerceNumber(total?.total) ??
          coerceNumber(total?.points);

        return {
          id: d.id,
          sport: sport,
          weekId: String(data.weekId ?? weekId),
          gameId: normalizeGameId(data, d.id),
          homeTeam,
          awayTeam,
          startTime,
          status: normalizeStatus(data.status),
          scoreHome: coerceNumber(data.scoreHome ?? data.homeScore),
          scoreAway: coerceNumber(data.scoreAway ?? data.awayScore),
          markets: {
            ...(moneyline
              ? {
                  moneyline: {
                    home: coerceNumber(moneyline.home),
                    away: coerceNumber(moneyline.away),
                  },
                }
              : {}),
            ...(spread || homeLine !== undefined || awayLine !== undefined
              ? {
                  spread: {
                    homeLine,
                    awayLine,
                    line: coerceNumber(spread?.line),
                  },
                }
              : {}),
            ...(totalLine !== undefined ? { total: { line: totalLine } } : {}),
          },
          updatedAt: data.updatedAt,
        } as GameDoc;
      });

      onRows(rows);
    },
    (err) => onError?.(err),
  );
}
