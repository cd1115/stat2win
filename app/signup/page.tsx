"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import {
  collection, doc, getDocs, query,
  serverTimestamp, setDoc, where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ensureUserProfileClient } from "@/lib/ensureUserProfile";

const PW_MIN_LENGTH = 8;

function passwordStrength(pw: string) {
  const hasMin = pw.length >= PW_MIN_LENGTH;
  const hasNumber = /\d/.test(pw);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
  const valid = hasMin && (hasNumber || hasSpecial);
  return { hasMin, hasNumber, hasSpecial, valid };
}

const USERNAME_RE = /^[a-zA-Z0-9._]{3,20}$/;

function usernameHint(u: string) {
  if (!u) return null;
  if (u.length < 3) return "Mínimo 3 caracteres.";
  if (u.length > 20) return "Máximo 20 caracteres.";
  if (!USERNAME_RE.test(u)) return "Solo letras, números, puntos y guiones bajos.";
  return null;
}

const inputCls = (invalid = false) =>
  `w-full h-12 rounded-2xl bg-white/5 border px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition ${
    invalid ? "border-red-400/50" : "border-white/10 focus:border-blue-500/40"
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

export default function SignupPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCfm, setShowCfm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pw = useMemo(() => passwordStrength(password), [password]);
  const uHint = useMemo(() => usernameHint(username), [username]);
  const pwMatch = confirm.length > 0 && password !== confirm;
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

  async function checkUsernameAvailable(u: string): Promise<boolean> {
    if (!USERNAME_RE.test(u)) return false;
    try {
      setCheckingUsername(true);
      const q = query(collection(db, "usernames"), where("username", "==", u.toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) { setErr(`El username "${u}" ya está en uso.`); return false; }
      const q2 = query(collection(db, "users"), where("username", "==", u.toLowerCase()));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) { setErr(`El username "${u}" ya está en uso.`); return false; }
      setErr(null);
      return true;
    } catch { return true; }
    finally { setCheckingUsername(false); }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!pw.valid) { setErr("La contraseña debe tener al menos 8 caracteres y un número o símbolo."); return; }
    if (password !== confirm) { setErr("Las contraseñas no coinciden."); return; }
    if (!USERNAME_RE.test(username)) { setErr("Username inválido."); return; }
    setLoading(true);
    try {
      const usernameOk = await checkUsernameAvailable(username.trim());
      if (!usernameOk) { setLoading(false); return; }

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = cred.user.uid;
      const finalUsername = username.trim().toLowerCase();
      const finalDisplayName = displayName.trim() || username.trim();

      try { await updateProfile(cred.user, { displayName: finalDisplayName }); } catch {}

      await setDoc(doc(db, "users", uid), {
        uid, email: email.trim().toLowerCase(),
        displayName: finalDisplayName, username: finalUsername,
        plan: "free", rewardPoints: 0,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }, { merge: true });

      await setDoc(doc(db, "usernames", finalUsername), {
        uid, username: finalUsername, createdAt: serverTimestamp(),
      });

      try { await ensureUserProfileClient(); } catch {}
      try { await auth.currentUser?.getIdToken(true); } catch {}

      router.replace("/dashboard");
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === "auth/email-already-in-use") setErr("Ese email ya está registrado.");
      else if (code === "auth/invalid-email") setErr("Ese email no es válido.");
      else if (code === "auth/weak-password") setErr("La contraseña está muy débil.");
      else setErr((error as { message?: string })?.message ?? "No se pudo crear la cuenta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#05070B] flex flex-col">

      {/* Background — only blue */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-blue-600/18 blur-[120px]" />
        <div className="absolute top-1/2 -right-40 h-[400px] w-[400px] rounded-full bg-blue-500/8 blur-[100px]" />
      </div>

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-6 py-5 flex-shrink-0">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-white">
          Stat<span className="text-blue-400">2</span>Win
        </Link>
        <Link href="/login" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/8 transition">
          Sign in
        </Link>
      </div>

      <div className="relative flex-1 flex items-start justify-center px-4 py-4 overflow-y-auto">
        <div className="w-full max-w-sm">

          {/* Hero */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-4 py-1.5 mb-4">
              <span className="text-amber-300 text-sm">◆</span>
              <span className="text-xs font-bold text-amber-300">+25 RP Welcome Bonus</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
              Create your account.<br/>
              <span className="text-blue-400">Start winning points.</span>
            </h1>
            <p className="text-sm text-white/40">
              Free to play · No gambling · Skill-based
            </p>
          </div>

          {/* Form card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl shadow-[0_0_60px_-20px_rgba(59,130,246,0.2)]">

            {err && (
              <div className="mb-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">⚠</span>
                {err}
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-3">

              {/* Display name */}
              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider block mb-1.5">Name</label>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  className={inputCls()} placeholder="Your name" type="text" autoComplete="name" required />
              </div>

              {/* Username */}
              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider block mb-1.5">Username</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-white/30 pointer-events-none">@</span>
                  <input value={username}
                    onChange={(e) => { setUsername(e.target.value); setErr(null); }}
                    onBlur={() => { if (USERNAME_RE.test(username)) checkUsernameAvailable(username.trim()); }}
                    className={`${inputCls(usernameTouched && !!uHint)} pl-8`}
                    placeholder="your_username" type="text" autoComplete="username" maxLength={20} required />
                  {checkingUsername && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-white/35">checking…</span>
                  )}
                </div>
                {usernameTouched && uHint && <p className="mt-1 text-xs text-red-300/90">{uHint}</p>}
                {usernameTouched && !uHint && username.length >= 3 && !checkingUsername && (
                  <p className="mt-1 text-xs text-emerald-400">✓ Available</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider block mb-1.5">Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)}
                  className={inputCls()} placeholder="you@email.com" type="email" autoComplete="email" required />
              </div>

              {/* Password */}
              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider block mb-1.5">Password</label>
                <div className="relative">
                  <input value={password} onChange={(e) => setPassword(e.target.value)}
                    className={inputCls(!pw.valid && password.length > 0)}
                    placeholder="••••••••" type={showPw ? "text" : "password"} autoComplete="new-password" required />
                  <button type="button" onClick={() => setShowPw((v) => !v)} tabIndex={-1}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-white/30 hover:text-white/60 transition">
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <PwRule ok={pw.hasMin} label={`${PW_MIN_LENGTH}+ chars`} />
                    <PwRule ok={pw.hasNumber} label="Number" />
                    <PwRule ok={pw.hasSpecial} label="Symbol" />
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div>
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider block mb-1.5">Confirm Password</label>
                <div className="relative">
                  <input value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    className={inputCls(pwMatch)} placeholder="••••••••"
                    type={showCfm ? "text" : "password"} autoComplete="new-password" required />
                  <button type="button" onClick={() => setShowCfm((v) => !v)} tabIndex={-1}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-white/30 hover:text-white/60 transition">
                    {showCfm ? "Hide" : "Show"}
                  </button>
                </div>
                {pwMatch && <p className="mt-1 text-xs text-red-300/90">Passwords don't match.</p>}
              </div>

              {/* Submit */}
              <button type="submit" disabled={loading || !canSubmit}
                className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition font-bold text-sm text-white mt-2 shadow-lg shadow-blue-600/25">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating account…
                  </span>
                ) : "Create account — free"}
              </button>
            </form>

            <div className="text-center text-sm text-white/40 mt-4">
              Already have an account?{" "}
              <Link href="/login" className="text-white/70 hover:text-white transition font-medium">Sign in</Link>
            </div>
          </div>

          <div className="text-center text-[11px] text-white/20 mt-4 pb-8">
            No gambling · No odds · Skill-based
          </div>
        </div>
      </div>
    </div>
  );
}
