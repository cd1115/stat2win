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

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur">
      {children}
    </span>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromLogout = searchParams.get("from") === "logout";
  const nextParam = searchParams.get("next");

  useEffect(() => {
    if (!fromLogout) return;

    const t = setTimeout(() => {
      router.replace("/login");
    }, 10000);

    return () => clearTimeout(t);
  }, [fromLogout, router]);

  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
        } catch (e) {
          console.error("ensureUserProfile failed (onAuthStateChanged):", e);
        }

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
      } catch (e) {
        console.error("ensureUserProfile failed (after login):", e);
      }

      try {
        await auth.currentUser?.getIdToken(true);
      } catch {}

      router.replace(nextParam || "/overview");
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;

      if (code === "auth/invalid-credential") {
        setErr("Email o contraseña incorrectos.");
      } else if (code === "auth/too-many-requests") {
        setErr("Demasiados intentos. Intenta en unos minutos.");
      } else {
        setErr(
          (error as { message?: string })?.message ??
            "No se pudo iniciar sesión."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#05070B] from-[#070A12] via-[#090B18] to-[#1B1230]">
        <div className="text-white/70 text-sm">Loading…</div>
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-[#05070B] from-[#070A12] via-[#090B18] to-[#1B1230]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[820px] rounded-full bg-blue-500/20 blur-3xl opacity-60" />
      <div className="pointer-events-none absolute -bottom-56 left-20 h-[520px] w-[520px] rounded-full bg-fuchsia-500/15 blur-3xl opacity-50" />

      <div className="relative mx-auto max-w-6xl px-6 py-16">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-white"
          >
            Stat<span className="text-blue-400">2</span>Win
          </Link>

          <Link
            href="/"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 hover:border-white/20 hover:bg-white/10 transition"
          >
            Home page
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Pill>No gambling</Pill>
              <Pill>Skill-based</Pill>
              <Pill>Weekly prizes</Pill>
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
              Pick winners. Earn points.{" "}
              <span className="text-blue-400">Win weekly prizes.</span>
            </h1>

            <p className="text-white/65 text-base md:text-lg max-w-xl">
              Compite en torneos semanales basados en habilidad. Sin odds. Sin
              apuestas. Solo estrategia.
            </p>

            <div className="grid grid-cols-3 gap-3 max-w-xl">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="text-sm font-semibold">Pick locks</div>
                <div className="mt-1 text-xs text-white/60">
                  Se bloquea al iniciar.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="text-sm font-semibold">Points</div>
                <div className="mt-1 text-xs text-white/60">
                  Se suman por aciertos.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="text-sm font-semibold">Leaderboard</div>
                <div className="mt-1 text-xs text-white/60">
                  Ranking semanal.
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold text-white">
                  Welcome back
                </div>
                <div className="mt-1 text-sm text-white/60">
                  Sign in to Stat2Win.
                </div>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                Stat2Win
              </span>
            </div>

            {fromLogout && (
              <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                <span className="font-semibold">Done.</span> You’ve been logged
                out. You can sign in again, or go back to the home page.
              </div>
            )}

            {err && (
              <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {err}
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label className="text-sm text-white/70">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full h-11 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="you@email.com"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-white/70">Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full h-11 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="••••••••"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="flex items-center justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm text-white/60 hover:text-white/80"
                >
                  Forgot your password?
                </Link>
              </div>

              <button
                disabled={loading}
                className="w-full h-11 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 transition font-semibold"
              >
                {loading ? "Signing in..." : "Login"}
              </button>

              <Link
                href="/signup"
                className="block w-full h-11 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-center leading-[44px] text-white/90"
              >
                Need an account? <span className="font-semibold">Sign up</span>
              </Link>

              <div className="pt-2 text-center text-xs text-white/45">
                No gambling • No odds • Skill-based competition
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
          <div className="text-white/70 text-sm">Loading…</div>
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}