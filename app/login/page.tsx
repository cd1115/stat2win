"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ensureUserProfileClient } from "@/lib/ensureUserProfile";

const inputCls =
  "w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:ring-2 focus:ring-blue-500/30 transition";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromLogout = searchParams.get("from") === "logout";
  const nextParam = searchParams.get("next");

  useEffect(() => {
    if (!fromLogout) return;
    const t = setTimeout(() => router.replace("/login"), 10000);
    return () => clearTimeout(t);
  }, [fromLogout, router]);

  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setChecking(false);
      if (u) {
        try {
          await ensureUserProfileClient();
        } catch {}
        try {
          await auth.currentUser?.getIdToken(true);
        } catch {}
        router.replace(nextParam || "/overview");
      }
    });
    return () => unsub();
  }, [router, nextParam]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      try {
        await ensureUserProfileClient();
      } catch {}
      try {
        await auth.currentUser?.getIdToken(true);
      } catch {}
      router.replace(nextParam || "/overview");
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === "auth/invalid-credential")
        setErr("Email o contraseña incorrectos.");
      else if (code === "auth/too-many-requests")
        setErr("Demasiados intentos. Intenta en unos minutos.");
      else
        setErr(
          (error as { message?: string })?.message ??
            "No se pudo iniciar sesión.",
        );
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#05070B]">
        <div className="flex items-center gap-2 text-white/40 text-sm">
          <span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          Cargando…
        </div>
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#05070B]">
      {/* Background glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[820px] rounded-full bg-blue-500/20 blur-3xl opacity-55" />

      <div className="pointer-events-none absolute top-1/3 right-0 h-[350px] w-[350px] rounded-full bg-blue-600/8 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 py-12">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-12">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-white"
          >
            Stat<span className="text-blue-400">2</span>Win
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/65 hover:border-white/18 hover:bg-white/8 hover:text-white/85 transition"
          >
            Home page
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* ── Left — marketing ── */}
          <div className="space-y-7">
            <div className="flex flex-wrap gap-2">
              {["No gambling", "Skill-based", "Weekly prizes"].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65"
                >
                  {t}
                </span>
              ))}
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Pick winners. <br className="hidden md:block" />
              Earn points. <span className="text-blue-400">Win prizes.</span>
            </h1>

            <p className="text-white/50 text-base max-w-md leading-relaxed">
              Compite en torneos diarios de NBA y MLB. Sin apuestas, sin odds —
              solo estrategia y conocimiento deportivo.
            </p>

            {/* Quick stats */}
            <div className="flex gap-8">
              {[
                { val: "100 pts", label: "por pick correcto" },
                { val: "Diario", label: "nuevo torneo" },
                { val: "Gratis", label: "para empezar" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-base font-bold text-white">{s.val}</div>
                  <div className="text-xs text-white/38 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-3 gap-3 max-w-md">
              {[
                {
                  icon: "🔒",
                  title: "Pick locks",
                  desc: "Se bloquea al inicio del juego.",
                },
                {
                  icon: "📊",
                  title: "Points",
                  desc: "100 pts por pick correcto.",
                },
                {
                  icon: "🏆",
                  title: "Leaderboard",
                  desc: "Ranking diario y semanal.",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-white/8 bg-white/[0.04] p-4"
                >
                  <div className="text-lg mb-1.5">{f.icon}</div>
                  <div className="text-xs font-semibold text-white/85">
                    {f.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/42 leading-snug">
                    {f.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right — login form ── */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-xl">
            {/* Form header */}
            <div className="mb-6">
              <div className="text-2xl font-bold text-white">Welcome back</div>
              <div className="mt-1 text-sm text-white/48">
                Inicia sesión para ver tus picks y torneos.
              </div>
            </div>

            {/* Logout notice */}
            {fromLogout && (
              <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-200">
                Sesión cerrada correctamente. Puedes iniciar sesión de nuevo.
              </div>
            )}

            {/* Error */}
            {err && (
              <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-start gap-2">
                <span className="flex-shrink-0">⚠</span>
                {err}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email */}
              <div>
                <label className="text-xs font-medium text-white/50 uppercase tracking-wide">
                  Email
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`mt-1.5 ${inputCls}`}
                  placeholder="you@email.com"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-white/50 uppercase tracking-wide">
                    Contraseña
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-white/38 hover:text-white/65 transition"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                    placeholder="••••••••"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/32 hover:text-white/60 transition px-1"
                  >
                    {showPw ? "Ocultar" : "Ver"}
                  </button>
                </div>
              </div>

              {/* Login button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-sm text-white mt-1"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Iniciando sesión…
                  </span>
                ) : (
                  "Iniciar sesión"
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 py-0.5">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-[11px] text-white/28">o</span>
                <div className="flex-1 h-px bg-white/8" />
              </div>

              {/* Signup CTA — includes +25 RP badge to motivate */}
              <Link
                href="/signup"
                className="flex items-center justify-center gap-1.5 w-full h-11 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/6 hover:border-white/15 transition text-sm text-white/65 hover:text-white/85 font-medium"
              >
                ¿No tienes cuenta?
                <span className="text-white font-semibold">Regístrate</span>
                <span className="rounded-full bg-amber-400/15 border border-amber-400/22 text-amber-300 text-[10px] px-2 py-0.5 font-semibold flex-shrink-0">
                  +25 RP gratis
                </span>
              </Link>

              <div className="text-center text-[11px] text-white/24 pt-1">
                No gambling · No odds · Skill-based competition
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center bg-[#05070B]">
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            Cargando…
          </div>
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
