"use client";

import Link from "next/link";

type League = "NBA" | "NFL" | "MLB" | "SOCCER";

type TournamentButton = {
  id: string;
  title: string;
  subtitle: string;
  href: string; // e.g. /tournaments?sport=NBA
  leagues: League[]; // 1 liga o mixto
  badge?: string; // "Free" | "Premium" | etc
};

function LeagueLogo({ league }: { league: League }) {
  // SVG simple (no dependes de imágenes externas)
  // Si luego quieres PNG/SVG reales, lo cambiamos por <Image />
  const common =
    "h-9 w-9 rounded-xl border border-white/10 bg-white/5 grid place-items-center text-xs font-bold";

  if (league === "NBA") return <div className={common}>NBA</div>;
  if (league === "NFL") return <div className={common}>NFL</div>;
  if (league === "MLB") return <div className={common}>MLB</div>;
  return <div className={common}>⚽</div>;
}

function LeagueStack({ leagues }: { leagues: League[] }) {
  const shown = leagues.slice(0, 3); // max 3 logos visibles
  return (
    <div className="flex items-center">
      {shown.map((l, i) => (
        <div
          key={l + i}
          className={["relative", i === 0 ? "" : "-ml-2"].join(" ")}
        >
          <LeagueLogo league={l} />
        </div>
      ))}
      {leagues.length > 3 ? (
        <div className="-ml-2 h-9 w-9 rounded-xl border border-white/10 bg-black/30 grid place-items-center text-xs text-white/70">
          +{leagues.length - 3}
        </div>
      ) : null}
    </div>
  );
}

export default function TournamentButtons({
  activeId,
  items,
}: {
  activeId?: string;
  items: TournamentButton[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((t) => {
        const active = activeId === t.id;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={[
              "group rounded-2xl border p-5 transition",
              active
                ? "border-blue-500/50 bg-blue-500/10"
                : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <LeagueStack leagues={t.leagues} />

              {t.badge ? (
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70">
                  {t.badge}
                </span>
              ) : null}
            </div>

            <div className="mt-4">
              <div className="text-lg font-semibold">{t.title}</div>
              <div className="mt-1 text-sm text-white/65">{t.subtitle}</div>
            </div>

            <div className="mt-4 inline-flex items-center gap-2 text-sm text-blue-300 opacity-90 group-hover:opacity-100">
              View tournaments <span className="text-white/60">→</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
