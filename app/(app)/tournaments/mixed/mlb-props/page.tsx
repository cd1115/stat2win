"use client";

import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { db, functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

// Game line markets (moneyline, spread, total)
type LineMarket =
  | "moneyline_home"
  | "moneyline_away"
  | "spread_home"
  | "spread_away"
  | "total_over"
  | "total_under";

// Player prop markets
type PropMarket =
  | "pitcher_strikeouts"
  | "pitcher_hits_allowed"
  | "batter_home_runs"
  | "batter_hits"
  | "batter_rbis"
  | "batter_strikeouts";

type AnyMarket = LineMarket | PropMarket;

interface GameLine {
  market: LineMarket;
  label: string; // e.g. "LAD ML", "NYM +1.5"
  line?: number; // spread or total value
  odds?: number | null;
}

interface PlayerProp {
  playerId: string;
  playerName: string;
  playerRole: "pitcher" | "batter";
  team: string;
  market: PropMarket;
  line: number;
  overOdds?: number | null;
  underOdds?: number | null;
}

interface GameWithProps {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  startTime: any;
  status: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
  // game lines (moneyline, spread, total)
  lines?: GameLine[];
  // player props (1 pitcher + 1 batter)
  props: PlayerProp[];
}

interface PickDoc {
  id: string;
  gameId: string;
  playerId?: string;
  market: AnyMarket;
  pick: "over" | "under" | "home" | "away";
  line?: number;
  result?: string;
  points?: number;
}

interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL?: string;
  totalPoints: number;
  totalPicks: number;
  wonPicks: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROP_LABEL: Record<PropMarket, string> = {
  pitcher_strikeouts: "Strikeouts",
  pitcher_hits_allowed: "Hits Allowed",
  batter_home_runs: "Home Runs",
  batter_hits: "Hits",
  batter_rbis: "RBIs",
  batter_strikeouts: "Strikeouts",
};

function fmtStart(ts: any) {
  try {
    const d: Date =
      ts?.toDate?.() instanceof Date
        ? ts.toDate()
        : ts instanceof Date
          ? ts
          : new Date(ts);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function fmtOdds(o?: number | null) {
  if (o == null) return "";
  return o > 0 ? `+${o}` : `${o}`;
}

function isClosed(status: string) {
  return status === "inprogress" || status === "final";
}

// ─── Pick button style ────────────────────────────────────────────────────────

function btnCls(
  active: boolean,
  disabled: boolean,
  color: "sky" | "amber" | "violet",
) {
  if (disabled)
    return "rounded-xl border border-white/6 bg-white/[0.02] p-3 text-center opacity-40 cursor-not-allowed";
  const rings: Record<string, string> = {
    sky: "border-sky-400/40 bg-sky-500/15 text-sky-100 ring-1 ring-sky-500/20",
    amber:
      "border-amber-400/40 bg-amber-500/15 text-amber-100 ring-1 ring-amber-500/20",
    violet:
      "border-violet-400/40 bg-violet-500/15 text-violet-100 ring-1 ring-violet-500/20",
  };
  return [
    "rounded-xl border p-3 text-center transition cursor-pointer",
    active
      ? rings[color]
      : "border-white/10 bg-black/20 text-white/75 hover:bg-white/8 hover:border-white/20",
  ].join(" ");
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

function WeeklyLeaderboard({
  weekId,
  currentUid,
}: {
  weekId: string;
  currentUid?: string;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!weekId) return;
    // Simple query — no orderBy to avoid needing composite index
    const q = query(
      collection(db, "player_props_leaderboard"),
      where("weekId", "==", weekId),
      where("sport", "==", "MLB"),
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ uid: d.id, ...(d.data() as any) }) as LeaderboardEntry)
          .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
          .slice(0, 20);
        setEntries(rows);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [weekId]);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/6 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="text-base">🏆</span>
          <span className="text-sm font-black text-white">
            Weekly Leaderboard
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-sky-400/20 bg-sky-500/8 px-2.5 py-0.5 text-[10px] font-bold text-sky-400 uppercase tracking-wider">
            MLB Props
          </span>
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-0.5 text-[10px] text-white/30">
            Top 20
          </span>
        </div>
      </div>

      {/* Prizes */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-white/5 bg-gradient-to-r from-amber-500/5 to-transparent">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/25">
          Prizes
        </span>
        {["#1 $100", "#2 $50", "#3 $25"].map((p) => (
          <span key={p} className="text-xs font-bold text-amber-300">
            {p}
          </span>
        ))}
      </div>

      <div className="divide-y divide-white/[0.04]">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-5 py-3 animate-pulse"
            >
              <div className="h-4 w-4 rounded bg-white/10" />
              <div className="h-7 w-7 rounded-full bg-white/10" />
              <div className="h-3 w-32 rounded bg-white/10" />
              <div className="ml-auto h-3 w-12 rounded bg-white/10" />
            </div>
          ))
        ) : entries.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-2xl mb-2">📊</div>
            <div className="text-sm text-white/40">
              No entries yet this week
            </div>
            <div className="text-xs text-white/25 mt-1">
              Make your picks to appear here!
            </div>
          </div>
        ) : (
          entries.map((entry, i) => {
            const isMe = entry.uid === currentUid;
            return (
              <div
                key={entry.uid}
                className={[
                  "flex items-center gap-3 px-5 py-3 transition",
                  isMe
                    ? "bg-sky-500/5 border-l-2 border-sky-500/40"
                    : "hover:bg-white/[0.02]",
                ].join(" ")}
              >
                <div className="w-6 flex-shrink-0 text-center">
                  {i < 3 ? (
                    <span className="text-base">{medals[i]}</span>
                  ) : (
                    <span className="text-xs font-bold text-white/25">
                      {i + 1}
                    </span>
                  )}
                </div>
                {entry.photoURL ? (
                  <img
                    src={entry.photoURL}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/50 flex-shrink-0">
                    {(entry.displayName ?? "?")[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span
                    className={[
                      "text-sm font-semibold truncate block",
                      isMe ? "text-sky-300" : "text-white/80",
                    ].join(" ")}
                  >
                    {entry.displayName ?? "Anonymous"}
                    {isMe && (
                      <span className="ml-1.5 text-[10px] text-sky-400/70">
                        (you)
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-white/25">
                    {entry.wonPicks ?? 0}/{entry.totalPicks ?? 0} correct
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <div
                    className={[
                      "text-sm font-black",
                      i < 3 ? "text-amber-300" : "text-white/70",
                    ].join(" ")}
                  >
                    {entry.totalPoints ?? 0}
                  </div>
                  <div className="text-[10px] text-white/25">pts</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Game Card ────────────────────────────────────────────────────────────────

function GameCard({
  game,
  pickMap,
  saving,
  onPick,
  canPick,
}: {
  game: GameWithProps;
  pickMap: Map<string, PickDoc>;
  saving: string | null;
  onPick: (
    key: string,
    market: AnyMarket,
    pick: PickDoc["pick"],
    gameId: string,
    prop?: PlayerProp,
  ) => void;
  canPick: boolean;
}) {
  const closed = isClosed(game.status);
  const disabled = closed || !canPick;

  const pitcher =
    game.props.filter((p) => p.playerRole === "pitcher")[0] ?? null;
  const batter = game.props.filter((p) => p.playerRole === "batter")[0] ?? null;

  function linePickKey(market: LineMarket) {
    return `${game.gameId}:line:${market}`;
  }
  function propPickKey(prop: PlayerProp) {
    return `${game.gameId}:${prop.playerId}:${prop.market}`;
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
      {/* ── Game header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 px-5 py-3.5 bg-white/[0.02]">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-base font-bold text-white">
            {game.awayTeam} <span className="text-white/30">@</span>{" "}
            {game.homeTeam}
          </span>
          <span
            className={[
              "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
              closed
                ? game.status === "final"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-amber-400/20 bg-amber-500/10 text-amber-300"
                : "border-blue-400/20 bg-blue-500/8 text-blue-300",
            ].join(" ")}
          >
            {game.status === "final"
              ? "Final"
              : game.status === "inprogress"
                ? "🔴 Live"
                : "Scheduled"}
          </span>
          {game.startTime && (
            <span className="text-xs text-white/30">
              {fmtStart(game.startTime)}
            </span>
          )}
          {game.status === "final" && (
            <span className="text-xs font-bold text-white/50">
              {game.scoreAway} – {game.scoreHome}
            </span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* ── SECTION 1: Game Lines ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-md border border-violet-400/30 bg-violet-500/8 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-violet-400">
              LINES
            </span>
            <span className="text-xs font-semibold text-white/50">
              Game Lines
            </span>
          </div>

          {/* Moneyline row */}
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/25 mb-2">
              Moneyline
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["away", "home"] as const).map((side) => {
                const team = side === "away" ? game.awayTeam : game.homeTeam;
                const market: LineMarket =
                  side === "away" ? "moneyline_away" : "moneyline_home";
                const key = linePickKey(market);
                const current = pickMap.get(key);
                const active = current?.pick === side;
                return (
                  <button
                    key={side}
                    disabled={disabled}
                    onClick={() => onPick(key, market, side, game.gameId)}
                    className={btnCls(active, disabled, "violet")}
                  >
                    <div className="text-[10px] text-white/40 mb-1 uppercase tracking-wider">
                      {team}
                    </div>
                    <div className="text-sm font-black">
                      {side === "away" ? "Away Win" : "Home Win"}
                    </div>
                    {current && (
                      <div
                        className={[
                          "mt-1 text-[10px] font-bold rounded-full px-2 py-0.5 inline-block",
                          current.result === "win"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : current.result === "loss"
                              ? "bg-red-500/15 text-red-400"
                              : "bg-violet-500/15 text-violet-400",
                        ].join(" ")}
                      >
                        ✓ {current.result ?? "pending"}
                        {current.points ? ` · +${current.points}pts` : ""}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Spread row */}
          {(game.lines ?? []).some((l) => l.market.startsWith("spread")) && (
            <div className="mb-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/25 mb-2">
                Spread
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["spread_away", "spread_home"] as const).map((market) => {
                  const line = (game.lines ?? []).find(
                    (l) => l.market === market,
                  );
                  if (!line) return null;
                  const side = market === "spread_away" ? "away" : "home";
                  const key = linePickKey(market);
                  const current = pickMap.get(key);
                  const active = current?.pick === side;
                  return (
                    <button
                      key={market}
                      disabled={disabled}
                      onClick={() => onPick(key, market, side, game.gameId)}
                      className={btnCls(active, disabled, "violet")}
                    >
                      <div className="text-[10px] text-white/40 mb-1 uppercase tracking-wider">
                        {market === "spread_away"
                          ? game.awayTeam
                          : game.homeTeam}
                      </div>
                      <div className="text-sm font-black">
                        {line.line != null
                          ? line.line > 0
                            ? `+${line.line}`
                            : `${line.line}`
                          : "—"}
                      </div>
                      <div className="text-[10px] text-white/30">
                        {fmtOdds(line.odds)}
                      </div>
                      {current && (
                        <div
                          className={[
                            "mt-1 text-[10px] font-bold rounded-full px-2 py-0.5 inline-block",
                            current.result === "win"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : current.result === "loss"
                                ? "bg-red-500/15 text-red-400"
                                : "bg-violet-500/15 text-violet-400",
                          ].join(" ")}
                        >
                          ✓ {current.result ?? "pending"}
                          {current.points ? ` · +${current.points}pts` : ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Total (O/U) row */}
          {(game.lines ?? []).some((l) => l.market.startsWith("total")) && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/25 mb-2">
                Total (O/U)
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["total_over", "total_under"] as const).map((market) => {
                  const line = (game.lines ?? []).find(
                    (l) => l.market === market,
                  );
                  if (!line) return null;
                  const side = market === "total_over" ? "over" : "under";
                  const key = linePickKey(market);
                  const current = pickMap.get(key);
                  const active = current?.pick === side;
                  return (
                    <button
                      key={market}
                      disabled={disabled}
                      onClick={() => onPick(key, market, side, game.gameId)}
                      className={btnCls(active, disabled, "violet")}
                    >
                      <div className="text-[10px] text-white/40 mb-1 uppercase tracking-wider">
                        {side.toUpperCase()}
                      </div>
                      <div className="text-sm font-black">
                        {line.line ?? "—"}
                      </div>
                      <div className="text-[10px] text-white/30">
                        Total Runs
                      </div>
                      {current && (
                        <div
                          className={[
                            "mt-1 text-[10px] font-bold rounded-full px-2 py-0.5 inline-block",
                            current.result === "win"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : current.result === "loss"
                                ? "bg-red-500/15 text-red-400"
                                : "bg-violet-500/15 text-violet-400",
                          ].join(" ")}
                        >
                          ✓ {current.result ?? "pending"}
                          {current.points ? ` · +${current.points}pts` : ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 2: Starting Pitcher ── */}
        {pitcher && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded-md border border-sky-400/30 bg-sky-500/8 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-sky-400">
                SP
              </span>
              <span className="text-xs font-semibold text-white/50">
                Starting Pitcher
              </span>
            </div>
            <div className="rounded-xl border border-white/6 bg-black/20 p-3.5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-bold text-white">
                    {pitcher.playerName}
                  </span>
                  <span className="ml-2 text-[10px] text-white/30">
                    {pitcher.team}
                  </span>
                </div>
                <span className="text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 rounded-lg px-2 py-0.5">
                  {PROP_LABEL[pitcher.market]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["over", "under"] as const).map((side) => {
                  const key = propPickKey(pitcher);
                  const current = pickMap.get(key);
                  const active = current?.pick === side;
                  const busy = saving === key;
                  return (
                    <button
                      key={side}
                      disabled={closed || busy || !canPick}
                      onClick={() =>
                        onPick(key, pitcher.market, side, game.gameId, pitcher)
                      }
                      className={btnCls(active, closed || !canPick, "sky")}
                    >
                      <div className="text-[10px] text-white/40 mb-0.5 uppercase tracking-wider">
                        {side}
                      </div>
                      <div className="text-lg font-black">{pitcher.line}</div>
                      <div className="text-[10px] text-white/30">
                        {PROP_LABEL[pitcher.market]}
                      </div>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const current = pickMap.get(propPickKey(pitcher));
                return current ? (
                  <div className="mt-2">
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        current.result === "win"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : current.result === "loss"
                            ? "bg-red-500/15 text-red-400"
                            : "bg-sky-500/15 text-sky-400",
                      ].join(" ")}
                    >
                      ✓ {current.pick.toUpperCase()} {pitcher.line}
                      {current.result && ` · ${current.result}`}
                      {current.points ? ` · +${current.points}pts` : ""}
                    </span>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        )}

        {/* ── SECTION 3: Star Batter ── */}
        {batter && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded-md border border-amber-400/30 bg-amber-500/8 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-400">
                BAT
              </span>
              <span className="text-xs font-semibold text-white/50">
                Star Batter
              </span>
            </div>
            <div className="rounded-xl border border-white/6 bg-black/20 p-3.5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-bold text-white">
                    {batter.playerName}
                  </span>
                  <span className="ml-2 text-[10px] text-white/30">
                    {batter.team}
                  </span>
                </div>
                <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-0.5">
                  {PROP_LABEL[batter.market]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["over", "under"] as const).map((side) => {
                  const key = propPickKey(batter);
                  const current = pickMap.get(key);
                  const active = current?.pick === side;
                  const busy = saving === key;
                  return (
                    <button
                      key={side}
                      disabled={closed || busy || !canPick}
                      onClick={() =>
                        onPick(key, batter.market, side, game.gameId, batter)
                      }
                      className={btnCls(active, closed || !canPick, "amber")}
                    >
                      <div className="text-[10px] text-white/40 mb-0.5 uppercase tracking-wider">
                        {side}
                      </div>
                      <div className="text-lg font-black">{batter.line}</div>
                      <div className="text-[10px] text-white/30">
                        {PROP_LABEL[batter.market]}
                      </div>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const current = pickMap.get(propPickKey(batter));
                return current ? (
                  <div className="mt-2">
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        current.result === "win"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : current.result === "loss"
                            ? "bg-red-500/15 text-red-400"
                            : "bg-amber-500/15 text-amber-400",
                      ].join(" ")}
                    >
                      ✓ {current.pick.toUpperCase()} {batter.line}
                      {current.result && ` · ${current.result}`}
                      {current.points ? ` · +${current.points}pts` : ""}
                    </span>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MLBPropsPage() {
  const { user } = useAuth();
  const { plan } = useUserEntitlements();
  // 🔓 OPEN BETA — free for everyone during testing
  const isPremium = plan === "premium";
  const weekId = useMemo(() => getWeekId(new Date()), []);
  const weekLabel = useMemo(() => getWeekRangeLabel(new Date(), "en-US"), []);

  const [games, setGames] = useState<GameWithProps[]>([]);
  const [myPicks, setMyPicks] = useState<PickDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"picks" | "leaderboard">("picks");
  const noticeTimer = useRef<number | null>(null);

  const placePickFn = useMemo(
    () => httpsCallable(functions, "placePlayerPropPick"),
    [],
  );

  function pushNotice(msg: string) {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }

  // ── Listen games ──
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");

    const slateDate = `${yyyy}-${mm}-${dd}`;

    const q = query(
      collection(db, "player_props_games"),
      where("sport", "==", "MLB"),
      where("slateDate", "==", slateDate),
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows: GameWithProps[] = snap.docs
          .map((d) => ({ ...(d.data() as any) }))
          .sort(
            (a, b) =>
              (a.startTime?.toDate?.()?.getTime?.() ?? 0) -
              (b.startTime?.toDate?.()?.getTime?.() ?? 0),
          );
        setGames(rows);
        setLoading(false);
      },
      (e) => {
        setErr(String((e as any)?.message ?? e));
        setLoading(false);
      },
    );
  }, [weekId]);

  // ── Listen my picks ──
  useEffect(() => {
    if (!user?.uid || !weekId) {
      setMyPicks([]);
      return;
    }
    const q = query(
      collection(db, "player_prop_picks"),
      where("uid", "==", user.uid),
      where("weekId", "==", weekId),
      where("sport", "==", "MLB"),
    );
    return onSnapshot(q, (snap) => {
      setMyPicks(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as PickDoc),
      );
    });
  }, [user?.uid, weekId]);

  const pickMap = useMemo(() => {
    const m = new Map<string, PickDoc>();
    for (const p of myPicks) {
      // For line picks key is gameId:line:market, for props gameId:playerId:market
      const key =
        (p as any).pickKey ?? `${p.gameId}:${p.playerId ?? "line"}:${p.market}`;
      m.set(key, p);
    }
    return m;
  }, [myPicks]);

  async function handlePick(
    key: string,
    market: AnyMarket,
    pick: PickDoc["pick"],
    gameId: string,
    prop?: PlayerProp,
  ) {
    if (!user?.uid) return;
    if (isClosed(games.find((g) => g.gameId === gameId)?.status ?? "")) {
      pushNotice("Picks are locked — game already started.");
      return;
    }
    const current = pickMap.get(key);
    const isToggle = current?.pick === pick;
    setSaving(key);
    try {
      await placePickFn({
        sport: "MLB",
        weekId,
        gameId,
        pickKey: key,
        market,
        pick,
        clear: isToggle,
        // player prop extra fields
        ...(prop
          ? {
              playerId: prop.playerId,
              playerName: prop.playerName,
              playerRole: prop.playerRole,
              team: prop.team,
              line: prop.line,
            }
          : {}),
      });
    } catch (e: any) {
      pushNotice(String(e?.message ?? e));
    } finally {
      setSaving(null);
    }
  }

  const totalPicks = myPicks.length;
  const wonPicks = myPicks.filter((p) => p.result === "win").length;
  const totalPts = myPicks.reduce((s, p) => s + (p.points ?? 0), 0);

  return (
    <Protected>
      <div className="px-6 py-6">
        <div className="mx-auto max-w-4xl">
          {/* ── Header ── */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/25">
              <Link
                href="/tournaments/mixed"
                className="hover:text-white/50 transition"
              >
                Mixed
              </Link>
              <span>/</span>
              <span className="text-sky-400">MLB Player Props</span>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-1">
                  ⚾ MLB Player Props
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/50">
                    {weekId}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/50">
                    {weekLabel}
                  </span>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/8 px-3 py-1 text-xs font-bold text-emerald-300">
                    🔓 Open Beta
                  </span>
                </div>
                <p className="mt-2 text-sm text-white/40 max-w-xl">
                  Pick game lines (ML · Spread · O/U) plus the starting pitcher
                  and star batter for each game.
                </p>
              </div>
              {totalPicks > 0 && (
                <div className="flex gap-3">
                  {[
                    { label: "Picks", val: totalPicks },
                    { label: "Wins", val: wonPicks },
                    { label: "Pts", val: totalPts },
                  ].map(({ label, val }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-center"
                    >
                      <div className="text-xs text-white/35">{label}</div>
                      <div className="text-lg font-bold text-white">{val}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notices */}
          {notice && (
            <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {notice}
            </div>
          )}
          {err && (
            <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {err}
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="flex gap-1 p-1 rounded-xl border border-white/8 bg-white/[0.03] mb-6 w-fit">
            {(["picks", "leaderboard"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  "rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition",
                  activeTab === tab
                    ? "bg-white/10 text-white"
                    : "text-white/35 hover:text-white/60",
                ].join(" ")}
              >
                {tab === "picks" ? "⚾ My Picks" : "🏆 Leaderboard"}
              </button>
            ))}
          </div>

          {/* ── PICKS TAB ── */}
          {activeTab === "picks" && (
            <>
              {!isPremium ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 py-16 text-center">
                  <div className="text-4xl mb-3">✦</div>
                  <div className="text-white font-bold text-lg mb-2">Premium Tournament</div>
                  <div className="text-white/50 text-sm mb-5 max-w-sm mx-auto">
                    Este torneo es exclusivo para miembros Premium. Suscríbete para acceder a los player props.
                  </div>
                  <a
                    href="/subscription"
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-6 py-2.5 text-sm font-bold text-amber-300 hover:bg-amber-500/20 transition"
                  >
                    ✦ Upgrade to Premium →
                  </a>
                </div>
              ) : loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-64 animate-pulse rounded-2xl bg-white/5"
                    />
                  ))}
                </div>
              ) : games.length === 0 ? (
                <div className="rounded-2xl border border-white/8 bg-white/[0.02] py-16 text-center">
                  <div className="text-4xl mb-3">⚾</div>
                  <div className="text-white/50 text-sm">
                    No games available yet for this week.
                  </div>
                  <div className="text-white/25 text-xs mt-1">
                    Games and props are loaded before each game day.
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {games.map((game) => (
                    <GameCard
                      key={game.gameId}
                      game={game}
                      pickMap={pickMap}
                      saving={saving}
                      onPick={handlePick}
                      canPick={!!user?.uid}
                    />
                  ))}
                </div>
              )}

              {/* Scoring info — only shown to premium */}
              {isPremium && (
              <div className="mt-6 rounded-xl border border-white/6 bg-white/[0.02] px-5 py-4">
                <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">
                  Scoring
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-white/40">
                  <div>
                    <span className="text-emerald-400 font-bold">+100 pts</span>{" "}
                    — Correct pick
                  </div>
                  <div>
                    <span className="text-red-400 font-bold">0 pts</span> —
                    Wrong pick
                  </div>
                  <div>
                    <span className="text-amber-400 font-bold">+50 pts</span> —
                    Push / exact line
                  </div>
                  <div>
                    <span className="text-sky-400 font-bold">Weekly</span> —
                    Resets every Sunday
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-3 gap-3 text-xs text-white/30">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-violet-400/50" />
                    Game Lines (ML · Spread · Total)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-sky-400/50" />
                    Starting Pitcher (Strikeouts / Hits)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-amber-400/50" />
                    Star Batter (HR / Hits / RBIs)
                  </div>
                </div>
              </div>
              )}
            </>
          )}

          {/* ── LEADERBOARD TAB ── */}
          {activeTab === "leaderboard" && (
            <WeeklyLeaderboard weekId={weekId} currentUid={user?.uid} />
          )}

          <div className="mt-6 flex items-center gap-3">
            <Link
              href="/tournaments/mixed"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/50 hover:bg-white/8 transition"
            >
              ← Back to Mixed
            </Link>
          </div>
        </div>
      </div>
    </Protected>
  );
}
