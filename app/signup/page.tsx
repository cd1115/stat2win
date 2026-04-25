"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ensureUserProfileClient } from "@/lib/ensureUserProfile";

// ── Password rules ────────────────────────────────────────────────────────────
const PW_MIN_LENGTH = 8;

function passwordStrength(pw: string) {
  const hasMin    = pw.length >= PW_MIN_LENGTH;
  const hasNumber = /\d/.test(pw);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
  const valid = hasMin && (hasNumber || hasSpecial);
  return { hasMin, hasNumber, hasSpecial, valid };
}

// ── Username rules ────────────────────────────────────────────────────────────
// 3–20 chars, only letters, numbers, dots, underscores
const USERNAME_RE = /^[a-zA-Z0-9._]{3,20}$/;

function usernameHint(u: string) {
  if (!u) return null;
  if (u.length < 3) return "Mínimo 3 caracteres.";
  if (u.length > 20) return "Máximo 20 caracteres.";
  if (!USERNAME_RE.test(u)) return "Solo letras, números, puntos y guiones bajos.";
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function FieldRow({ label, hint, children }: { label: string; hint?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-white/60 uppercase tracking-wide">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-red-300/90">{hint}</p>}
    </div>
  );
}

const inputCls = (invalid = false) =>
  `w-full h-11 rounded-xl bg-white/5 border px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition ${
    invalid ? "border-red-400/50 focus:ring-red-400/30" : "border-white/10 focus:border-white/20"
  }`;

function PwRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1.5 text-[11px] ${ok ? "text-emerald-400" : "text-white/35"}`}>
      <span className={`inline-flex w-3.5 h-3.5 rounded-full items-center justify-center text-[9px] font-bold flex-shrink-0 ${ok ? "bg-emerald-500/20 text-emerald-400" : "bg-white/8 text-white/30"}`}>
        {ok ? "✓" : "·"}
      </span>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SignupPage() {
  const router = useRouter();

  const [displayName, setDisplayName]   = useState("");
  const [username, setUsername]         = useState("");
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [confirm, setConfirm]           = useState("");

  const [showPw, setShowPw]   = useState(false);
  const [showCfm, setShowCfm] = useState(false);

  const [loading, setLoading]           = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [err, setErr]                   = useState<string | null>(null);

  const pw       = useMemo(() => passwordStrength(password), [password]);
  const uHint    = useMemo(() => usernameHint(username), [username]);
  const pwMatch  = confirm.length > 0 && password !== confirm;
  const usernameTouched = username.length > 0;

  const canSubmit = useMemo(() => {
    return (
      displayName.trim().length > 0 &&
      username.trim().length >= 3 &&
      USERNAME_RE.test(username) &&
      email.trim().length > 3 &&
      pw.valid &&
      password === confirm &&
      confirm.length >= PW_MIN_LENGTH
    );
  }, [displayName, username, email, pw.valid, password, confirm]);

  // ── Check username availability on blur ──────────────────────────────────
  async function checkUsernameAvailable(u: string): Promise<boolean> {
    if (!USERNAME_RE.test(u)) return false;
    try {
      setCheckingUsername(true);
      const q = query(
        collection(db, "usernames"),
        where("username", "==", u.toLowerCase()),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setErr(`El username "${u}" ya está en uso. Elige otro.`);
        return false;
      }
      // Also check users collection by username field
      const q2 = query(
        collection(db, "users"),
        where("username", "==", u.toLowerCase()),
      );
      const snap2 = await getDocs(q2);
      if (!snap2.empty) {
        setErr(`El username "${u}" ya está en uso. Elige otro.`);
        return false;
      }
      setErr(null);
      return true;
    } catch {
      return true; // don't block signup if check fails
    } finally {
      setCheckingUsername(false);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!pw.valid) {
      setErr("La contraseña debe tener al menos 8 caracteres y un número o símbolo.");
      return;
    }
    if (password !== confirm) {
      setErr("Las contraseñas no coinciden.");
      return;
    }
    if (!USERNAME_RE.test(username)) {
      setErr("Username inválido.");
      return;
    }

    setLoading(true);
    try {
      // 1. Verify username one more time server-side before creating account
      const usernameOk = await checkUsernameAvailable(username.trim());
      if (!usernameOk) { setLoading(false); return; }

      // 2. Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      const uid = cred.user.uid;
      const finalUsername   = username.trim().toLowerCase();
      const finalDisplayName = displayName.trim() || username.trim();

      // 3. Update Firebase Auth profile
      try {
        await updateProfile(cred.user, { displayName: finalDisplayName });
      } catch {}

      // 4. Write user document — only fields allowed by Firestore rules on CREATE
      //    (no points, no plan — those are set by Cloud Functions)
      await setDoc(
        doc(db, "users", uid),
        {
          uid,
          email: email.trim().toLowerCase(),
          displayName: finalDisplayName,
          username: finalUsername,
          plan: "free",
          rewardPoints: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // 5. Reserve username in usernames collection (for uniqueness checks)
      await setDoc(doc(db, "usernames", finalUsername), {
        uid,
        username: finalUsername,
        createdAt: serverTimestamp(),
      });

      // 6. Ensure user profile (your existing helper)
      try {
        await ensureUserProfileClient();
      } catch (e) {
        console.error("ensureUserProfile failed:", e);
      }

      // 7. Refresh token so custom claims load
      try {
        await auth.currentUser?.getIdToken(true);
      } catch {}

      router.replace("/overview");
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === "auth/email-already-in-use") {
        setErr("Ese email ya está registrado. Intenta hacer login.");
      } else if (code === "auth/invalid-email") {
        setErr("Ese email no es válido.");
      } else if (code === "auth/weak-password") {
        setErr("La contraseña está muy débil.");
      } else {
        setErr(
          (error as { message?: string })?.message ?? "No se pudo crear la cuenta.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#05070B]">
      {/* Background glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[820px] rounded-full bg-blue-500/20 blur-3xl opacity-60" />
      <div className="pointer-events-none absolute -bottom-56 left-20 h-[520px] w-[520px] rounded-full bg-fuchsia-500/15 blur-3xl opacity-50" />

      <div className="relative mx-auto max-w-6xl px-6 py-12">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-10">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            Stat<span className="text-blue-400">2</span>Win
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:border-white/20 hover:bg-white/8 transition"
          >
            Back to login
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* ── Left — marketing copy ── */}
          <div className="space-y-6 lg:pt-4">
            <div className="flex flex-wrap gap-2">
              {["No gambling", "Skill-based", "Weekly prizes"].map((t) => (
                <span key={t} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
                  {t}
                </span>
              ))}
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Create your account.{" "}
              <span className="text-blue-400">Start winning points.</span>
            </h1>

            <p className="text-white/60 text-base max-w-md">
              Crea tu cuenta, únete al torneo diario, haz tus picks y gana RP.
              Los mejores de cada semana reciben premios reales.
            </p>

            {/* Feature cards */}
            <div className="grid grid-cols-3 gap-3 max-w-md">
              {[
                { icon: "🔒", title: "Pick locks", desc: "Se bloquea al iniciar el juego." },
                { icon: "🏆", title: "Points", desc: "100 pts por pick correcto." },
                { icon: "🎁", title: "Rewards", desc: "RP canjeables en la tienda." },
              ].map((f) => (
                <div key={f.title} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                  <div className="text-lg mb-1">{f.icon}</div>
                  <div className="text-xs font-semibold text-white">{f.title}</div>
                  <div className="mt-0.5 text-[11px] text-white/50">{f.desc}</div>
                </div>
              ))}
            </div>

            {/* Welcome bonus callout */}
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 max-w-md flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">🎉</span>
              <div>
                <div className="text-sm font-semibold text-amber-200">Bonus de bienvenida</div>
                <div className="text-xs text-white/55 mt-0.5">
                  Crea tu cuenta, únete a un torneo y haz tu primer pick.
                  Gana <span className="text-amber-300 font-semibold">25 RP</span> automáticamente — solo la primera vez.
                </div>
              </div>
            </div>
          </div>

          {/* ── Right — form ── */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-xl">
            <div className="mb-6">
              <div className="text-xl font-bold text-white">Crea tu cuenta</div>
              <div className="mt-1 text-xs text-white/45">
                Todos los campos marcados son requeridos.
              </div>
            </div>

            {err && (
              <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {err}
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-4">

              {/* Display name */}
              <FieldRow label="Nombre *">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputCls()}
                  placeholder="Tu nombre completo"
                  type="text"
                  autoComplete="name"
                  required
                />
              </FieldRow>

              {/* Username */}
              <FieldRow
                label="Username *"
                hint={usernameTouched ? uHint : null}
              >
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-white/30 pointer-events-none">@</span>
                  <input
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setErr(null);
                    }}
                    onBlur={() => {
                      if (USERNAME_RE.test(username)) {
                        checkUsernameAvailable(username.trim());
                      }
                    }}
                    className={`${inputCls(usernameTouched && !!uHint)} pl-8`}
                    placeholder="tu_username"
                    type="text"
                    autoComplete="username"
                    maxLength={20}
                    required
                  />
                  {checkingUsername && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/35">
                      verificando…
                    </span>
                  )}
                </div>
                {usernameTouched && !uHint && username.length >= 3 && !checkingUsername && (
                  <p className="mt-1.5 text-xs text-emerald-400">✓ Disponible</p>
                )}
              </FieldRow>

              {/* Email */}
              <FieldRow label="Email *">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls()}
                  placeholder="you@email.com"
                  type="email"
                  autoComplete="email"
                  required
                />
              </FieldRow>

              {/* Password */}
              <FieldRow label="Contraseña *">
                <div className="relative">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls(!pw.valid && password.length > 0)}
                    placeholder="••••••••"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/35 hover:text-white/60 transition px-1"
                    tabIndex={-1}
                  >
                    {showPw ? "Ocultar" : "Ver"}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <PwRule ok={pw.hasMin}     label={`${PW_MIN_LENGTH}+ caracteres`} />
                    <PwRule ok={pw.hasNumber}  label="Al menos un número" />
                    <PwRule ok={pw.hasSpecial} label="Al menos un símbolo" />
                  </div>
                )}
              </FieldRow>

              {/* Confirm password */}
              <FieldRow
                label="Confirmar contraseña *"
                hint={pwMatch ? "Las contraseñas no coinciden." : null}
              >
                <div className="relative">
                  <input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={inputCls(pwMatch)}
                    placeholder="••••••••"
                    type={showCfm ? "text" : "password"}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCfm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/35 hover:text-white/60 transition px-1"
                    tabIndex={-1}
                  >
                    {showCfm ? "Ocultar" : "Ver"}
                  </button>
                </div>
              </FieldRow>

              {/* Divider — shipping address moved to Settings */}
              <div className="rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3 flex items-center gap-3">
                <span className="text-base flex-shrink-0">📦</span>
                <div>
                  <div className="text-xs font-medium text-white/70">Dirección de envío</div>
                  <div className="text-[11px] text-white/40 mt-0.5">
                    Puedes agregarla después en <span className="text-white/60">Settings → Shipping</span>. Se usa para envío de premios.
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-sm text-white mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creando cuenta…
                  </span>
                ) : (
                  "Crear cuenta"
                )}
              </button>

              <div className="text-center text-sm text-white/50 pt-1">
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="text-white/80 hover:text-white transition">
                  Inicia sesión
                </Link>
              </div>

              <div className="text-center text-[11px] text-white/30">
                No gambling · No odds · Skill-based competition
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
