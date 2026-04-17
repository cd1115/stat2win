"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
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
  const [googleLoading, setGoogleLoading] = useState(false);
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

  async function handleGoogleLogin() {
    setErr(null);
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      try {
        await ensureUserProfileClient();
      } catch {}
      try {
        await auth.currentUser?.getIdToken(true);
      } catch {}
      router.replace(nextParam || "/overview");
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === "auth/popup-closed-by-user") {
        // silently ignore
      } else if (code === "auth/cancelled-popup-request") {
        // silently ignore
      } else {
        setErr(
          (error as { message?: string })?.message ??
            "No se pudo iniciar sesión con Google.",
        );
      }
    } finally {
      setGoogleLoading(false);
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
    <div className="min-h-screen relative overflow-hidden bg-[#05070B] flex flex-col">
      {/* Background glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[820px] rounded-full bg-blue-500/30 blur-3xl opacity-70" />
      <div className="pointer-events-none absolute top-1/3 right-0 h-[400px] w-[400px] rounded-full bg-blue-600/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-[300px] w-[500px] rounded-full bg-blue-700/15 blur-3xl" />

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-8 py-6">
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

      {/* Centered form */}
      <div className="relative flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Logo mark */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center px-5 py-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4">
              <span className="text-xl font-extrabold tracking-tight text-white">
                Stat<span className="text-blue-400">2</span>Win
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-white/45">
              Inicia sesión para ver tus picks y torneos.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-xl shadow-[0_0_80px_-20px_rgba(59,130,246,0.15)]">
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
              {/* Google Sign-in */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
                className="w-full h-11 rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/[0.08] hover:border-white/18 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-3 text-sm font-medium text-white/80 hover:text-white"
              >
                {googleLoading ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                )}
                Continuar con Google
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-[11px] text-white/28">o inicia con email</span>
                <div className="flex-1 h-px bg-white/8" />
              </div>

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

              {/* Signup CTA */}
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
