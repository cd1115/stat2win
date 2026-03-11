"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ensureUserProfileClient } from "@/lib/ensureUserProfile";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur">
      {children}
    </span>
  );
}

export default function SignupPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Address
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateProv, setStateProv] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("US");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    // dirección la dejamos opcional por ahora (por si no quieren ponerla en signup)
    return (
      email.trim().length > 3 &&
      password.length >= 6 &&
      confirm.length >= 6 &&
      password === confirm
    );
  }, [email, password, confirm]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (password !== confirm) {
      setErr("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      // opcional: nombre bonito en UI
      if (displayName.trim()) {
        try {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        } catch {}
      }

      // asegura user profile base (tu helper)
      try {
        await ensureUserProfileClient();
      } catch (e) {
        console.error("ensureUserProfile failed (after signup):", e);
      }

      // guarda dirección (merge)
      const uid = cred.user.uid;

      const address =
        line1.trim() ||
        line2.trim() ||
        city.trim() ||
        stateProv.trim() ||
        zip.trim() ||
        country.trim()
          ? {
              line1: line1.trim(),
              line2: line2.trim(),
              city: city.trim(),
              state: stateProv.trim(),
              zip: zip.trim(),
              country: country.trim(),
            }
          : null;

      await setDoc(
        doc(db, "users", uid),
        {
          uid,
          email: email.trim(),
          displayName: displayName.trim() || null,
          address, // null si no llenó nada
          updatedAt: serverTimestamp(),
          // createdAt solo si no existe aún (pero merge no lo sobreescribe si ya existe)
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );

      // refresca token
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
        setErr("La contraseña está muy débil (mínimo 6 caracteres).");
      } else {
        setErr(
          (error as { message?: string })?.message ??
            "No se pudo crear la cuenta.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background igual al login */}
      <div className="absolute inset-0 bg-[#05070B] from-[#070A12] via-[#090B18] to-[#1B1230]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[820px] rounded-full bg-blue-500/20 blur-3xl opacity-60" />
      <div className="pointer-events-none absolute -bottom-56 left-20 h-[520px] w-[520px] rounded-full bg-fuchsia-500/15 blur-3xl opacity-50" />

      <div className="relative mx-auto max-w-6xl px-6 py-16">
        {/* Top row */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-white"
          >
            Stat<span className="text-blue-400">2</span>Win
          </Link>

          <Link
            href="/login"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 hover:border-white/20 hover:bg-white/10 transition"
          >
            Back to login
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          {/* Left */}
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Pill>No gambling</Pill>
              <Pill>Skill-based</Pill>
              <Pill>Weekly prizes</Pill>
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
              Create your account.{" "}
              <span className="text-blue-400">Start winning points.</span>
            </h1>

            <p className="text-white/65 text-base md:text-lg max-w-xl">
              Crea tu cuenta para competir, sumar puntos y subir en el
              leaderboard semanal.
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
                <div className="text-sm font-semibold">Rewards</div>
                <div className="mt-1 text-xs text-white/60">
                  Envíos y premios.
                </div>
              </div>
            </div>
          </div>

          {/* Right card */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold text-white">Sign up</div>
                <div className="mt-1 text-sm text-white/60">
                  Create your Stat2Win account.
                </div>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                Stat2Win
              </span>
            </div>

            {err && (
              <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {err}
              </div>
            )}

            <form onSubmit={handleSignup} className="mt-6 space-y-4">
              {/* Basics */}
              <div>
                <label className="text-sm text-white/70">Name </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-2 w-full h-11 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Name"
                  type="text"
                  autoComplete="name"
                />
              </div>

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
                  autoComplete="new-password"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-white/70">
                  Confirm password
                </label>
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-2 w-full h-11 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="••••••••"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>

              {/* Address */}
              <div className="pt-2">
                <div className="text-sm font-semibold text-white/85">
                  Shipping address (optional)
                </div>
                <div className="mt-1 text-xs text-white/50">
                  Puedes llenarla ahora o después en Settings.
                </div>
              </div>

              <div>
                <label className="text-sm text-white/70">Address line 1</label>
                <input
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  className="mt-2 w-full h-11 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="123 Main St"
                  type="text"
                  autoComplete="address-line1"
                />
              </div>

              <div>
                <label className="text-sm text-white/70">
                  Address line 2 (optional)
                </label>
                <input
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                  className="mt-2 w-full h-11 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Apt, Suite, etc."
                  type="text"
                  autoComplete="address-line2"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-white/70">City</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="mt-2 w-full h-11 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="San Juan"
                    type="text"
                    autoComplete="address-level2"
                  />
                </div>

                <div>
                  <label className="text-sm text-white/70">
                    State / Province
                  </label>
                  <input
                    value={stateProv}
                    onChange={(e) => setStateProv(e.target.value)}
                    className="mt-2 w-full h-11 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="PR"
                    type="text"
                    autoComplete="address-level1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-white/70">
                    ZIP / Postal code
                  </label>
                  <input
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="mt-2 w-full h-11 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="00901"
                    type="text"
                    autoComplete="postal-code"
                  />
                </div>

                <div>
                  <label className="text-sm text-white/70">Country</label>
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="mt-2 w-full h-11 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="US"
                    type="text"
                    autoComplete="country"
                  />
                </div>
              </div>

              <button
                disabled={loading || !canSubmit}
                className="w-full h-11 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 transition font-semibold"
              >
                {loading ? "Creating..." : "Create account"}
              </button>

              <div className="pt-2 text-center text-sm text-white/60">
                Already have an account?{" "}
                <Link href="/login" className="text-white/85 hover:text-white">
                  Log in
                </Link>
              </div>

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
