"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getApp } from "firebase/app";

type Props = {
  children: React.ReactNode;
};

export default function AdminGuard({ children }: Props) {
  const auth = useMemo(() => getAuth(getApp()), []);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [claims, setClaims] = useState<Record<string, any> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function readClaims(forceRefresh = false) {
    const user = auth.currentUser;
    if (!user) return;

    const res = await user.getIdTokenResult(forceRefresh);
    setClaims(res.claims || null);
    setIsAdmin(res.claims?.admin === true);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setErr(null);
      if (!user) {
        setUid(null);
        setEmail(null);
        setClaims(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setUid(user.uid);
      setEmail(user.email ?? null);

      try {
        await readClaims(false);
      } catch (e: any) {
        setErr(e?.message ?? "Error reading token claims");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [auth]);

  const canEnter = !loading && isAdmin;

  return (
    <div className="w-full">
      {/* Debug box (solo se ve dentro de /admin) */}
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-semibold text-white">Admin Guard</div>

        <div className="mt-2 grid gap-1 text-xs text-white/70">
          <div>
            <span className="text-white/50">UID:</span>{" "}
            <span className="text-white/80">{uid ?? "—"}</span>
          </div>
          <div>
            <span className="text-white/50">Email:</span>{" "}
            <span className="text-white/80">{email ?? "—"}</span>
          </div>
          <div>
            <span className="text-white/50">admin claim:</span>{" "}
            <span className={isAdmin ? "text-emerald-300" : "text-red-300"}>
              {String(isAdmin)}
            </span>
          </div>
        </div>

        {claims && (
          <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] text-white/70">
            {JSON.stringify(claims, null, 2)}
          </pre>
        )}

        {err && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {err}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={async () => {
              setErr(null);
              try {
                await readClaims(true); // 🔥 fuerza refresh del token
              } catch (e: any) {
                setErr(e?.message ?? "Error refreshing token");
              }
            }}
            className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/15"
          >
            Refresh admin access (force token refresh)
          </button>

          <button
            onClick={async () => {
              setErr(null);
              try {
                await readClaims(false);
              } catch (e: any) {
                setErr(e?.message ?? "Error reading token");
              }
            }}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
          >
            Re-check
          </button>
        </div>
      </div>

      {/* Gate */}
      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
          Checking admin access…
        </div>
      ) : canEnter ? (
        children
      ) : (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
          permission-denied: tu token no trae el claim <b>admin:true</b>.
          <div className="mt-2 text-xs text-red-200/80">
            Solución: setear el claim en Firebase Admin y luego Logout/Login o
            darle al botón <b>Refresh admin access</b>.
          </div>
        </div>
      )}
    </div>
  );
}
