"use client";

export default function OverviewPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="mx-auto w-full max-w-6xl rounded-3xl border border-white/10 bg-[#121418] p-6 md:p-8">
        <h2 className="text-2xl font-semibold text-white md:text-3xl">
          Overview
        </h2>
        <p className="mt-2 max-w-3xl text-white/60">
          Bienvenido a{" "}
          <span className="font-medium text-white/80">Stat2Win</span>: una
          competencia deportiva basada en habilidad. Elige ganadores, acumula
          puntos y sube en el leaderboard semanal.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Pill>Skill-based</Pill>
          <Pill>No odds</Pill>
          <Pill>Weekly prizes</Pill>
          <Pill>Pick locks</Pill>
        </div>
      </section>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-[#121418]">
        <div className="relative p-7 md:p-10">
          {/* glow */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/18 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-blue-400/[0.03] to-transparent" />

          <div className="relative max-w-3xl">
            <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-6xl">
              Stat<span className="text-blue-400">2</span>Win
            </h1>

            <p className="mt-3 text-base text-white/70 md:text-lg">
              Compite semanalmente: selecciona ganadores antes del{" "}
              <span className="font-medium text-white/85">lock</span>, gana
              puntos por aciertos y escala posiciones en el leaderboard.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button className="h-12 rounded-2xl bg-blue-600 px-6 font-semibold text-white transition hover:bg-blue-500">
                Manage Subscription
              </button>

              <button className="h-12 rounded-2xl border border-white/10 bg-[#1A1F29] px-6 text-white/85 transition hover:bg-[#222836]">
                How it Works
              </button>
            </div>

            <div className="mt-5 text-xs text-white/50">
              Sin apuestas • Sin probabilidades • Solo habilidad • Premios
              semanales
            </div>
          </div>
        </div>
      </section>

      {/* Info cards */}
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-1">
          <CardTitle>Suscripción</CardTitle>
          <CardText>
            Acceso completo a la plataforma: torneos activos, picks, leaderboard
            semanal y futuras estadísticas.
          </CardText>
          <div className="mt-4 space-y-2">
            <Row label="Plan" value="$9.99 / mes" />
            <Row label="Incluye" value="Acceso a torneos" />
            <Row label="Objetivo" value="Competencia semanal" />
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-1">
          <CardTitle>Picks & Lock</CardTitle>
          <CardText>
            Selecciona el ganador antes de que empiece el juego. Cuando inicia,
            el pick se bloquea automáticamente.
          </CardText>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="Estado" value="Open / Locked" />
            <MiniStat label="Regla" value="Antes del start" />
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-1">
          <CardTitle>Puntos & Premios</CardTitle>
          <CardText>
            Ganas puntos por aciertos. Al final de la semana el leaderboard
            define ganadores y premios.
          </CardText>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="Puntos" value="Por acierto" />
            <MiniStat label="Premios" value="Weekly" />
          </div>
        </GlassCard>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white">How it works</h3>
            <p className="mt-1 text-sm text-white/55">
              El flujo es simple: pick → lock → resultado → puntos →
              leaderboard.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StepCard
            step="01"
            title="Elige juegos"
            desc="Entra a tu torneo y selecciona los juegos disponibles."
          />
          <StepCard
            step="02"
            title="Haz tu pick"
            desc="Marca el equipo que crees que ganará antes del lock."
          />
          <StepCard
            step="03"
            title="Se bloquea"
            desc="Cuando inicia el juego, tu pick queda locked automáticamente."
          />
          <StepCard
            step="04"
            title="Suma puntos"
            desc="Al finalizar, se calculan puntos y se actualiza el leaderboard."
          />
        </div>
      </section>

      {/* Next steps + Quick actions */}
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <CardTitle>Lo que puedes hacer ahora</CardTitle>
          <CardText>
            Empieza rápido: entra a torneos, crea picks y monitorea tu posición
            semanal.
          </CardText>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ActionCard
              title="My Picks"
              desc="Revisa tus picks y estados."
              cta="Open"
            />
            <ActionCard
              title="Tournaments"
              desc="Explora torneos activos."
              cta="Browse"
            />
            <ActionCard
              title="Leaderboard"
              desc="Ve tu ranking semanal."
              cta="View"
            />
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-[#0F1115] p-4">
            <div className="text-sm text-white/70">
              Tip: mientras más consistente seas semana a semana, más subes en
              el ranking.
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <CardTitle>Reglas rápidas</CardTitle>
          <div className="mt-3 space-y-3">
            <Bullet>
              Los picks se{" "}
              <span className="font-medium text-white/85">bloquean</span> al
              iniciar el juego.
            </Bullet>
            <Bullet>
              Los puntos se actualizan cuando el juego termina (
              <span className="font-medium text-white/85">Final</span>).
            </Bullet>
            <Bullet>
              El leaderboard es{" "}
              <span className="font-medium text-white/85">semanal</span>.
            </Bullet>
            <Bullet>Los premios se anuncian al cerrar la semana.</Bullet>
          </div>
        </GlassCard>
      </section>

      <div className="h-4" />
    </div>
  );
}

/* ---------- UI helpers ---------- */

function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-3xl border border-white/10 bg-[#121418] p-6 " +
        "shadow-[0_0_0_1px_rgba(255,255,255,0.04)] " +
        className
      }
    >
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-lg font-semibold text-white">{children}</h4>;
}

function CardText({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm text-white/60">{children}</p>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-[#1A1F29] px-3 py-1 text-xs text-white/70">
      {children}
    </span>
  );
}

function StepCard({
  step,
  title,
  desc,
}: {
  step: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#121418] p-6">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/50">Step</span>
        <span className="rounded-full border border-white/10 bg-[#1A1F29] px-3 py-1 text-xs text-white/70">
          {step}
        </span>
      </div>
      <div className="mt-4 font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-white/60">{desc}</div>
    </div>
  );
}

function ActionCard({
  title,
  desc,
  cta,
}: {
  title: string;
  desc: string;
  cta: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#161A22] p-4">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-xs text-white/55">{desc}</div>
      <button className="mt-4 h-10 w-full rounded-2xl border border-white/10 bg-[#1A1F29] text-sm text-white/85 transition hover:bg-[#222836]">
        {cta}
      </button>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#161A22] p-3">
      <div className="text-[11px] text-white/50">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#1A1F29] px-3 py-2">
      <span className="text-xs text-white/55">{label}</span>
      <span className="text-xs font-medium text-white/85">{value}</span>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-white/60">
      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-white/30" />
      <span>{children}</span>
    </div>
  );
}