"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, collection, query, where, orderBy, limit, getFirestore } from "firebase/firestore";
import { getApp } from "firebase/app";
import { auth, db } from "@/lib/firebase";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { cn } from "@/lib/cn";

type RedeemDoc = {
  id: string;
  productId: string;
  title?: string;
  pointsCost: number;
  status: string;
  createdAt?: any;
};

function formatDate(ts?: any) {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

function StatusPill({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const styles: Record<string, string> = {
    pending:   "bg-amber-500/15 text-amber-200 border-amber-500/20",
    created:   "bg-amber-500/15 text-amber-200 border-amber-500/20",
    shipped:   "bg-sky-500/15 text-sky-200 border-sky-500/20",
    delivered: "bg-emerald-500/15 text-emerald-200 border-emerald-500/20",
    fulfilled: "bg-emerald-500/15 text-emerald-200 border-emerald-500/20",
    cancelled: "bg-red-500/15 text-red-200 border-red-500/20",
  };
  const labels: Record<string, string> = {
    pending: "Pending", created: "Pending", shipped: "Shipped",
    delivered: "Delivered", fulfilled: "Fulfilled", cancelled: "Cancelled",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", styles[s] ?? "bg-amber-500/15 text-amber-200 border-amber-500/20")}>
      {labels[s] ?? s}
    </span>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [redeems, setRedeems] = useState<RedeemDoc[]>([]);
  const [loadingRedeems, setLoadingRedeems] = useState(true);
  const { plan, rewardPoints, loading: entLoading, isAdmin } = useUserEntitlements();
  const isPremium = plan === "premium";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setEmail(u?.email ?? "");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        setUsername(data?.username ?? data?.displayName ?? "");
        setAvatarUrl(data?.avatarUrl ?? null);
      }
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    setLoadingRedeems(true);
    const fdb = getFirestore(getApp());
    const q = query(
      collection(fdb, "redeems"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(10),
    );
    const unsub = onSnapshot(q, (snap) => {
      setRedeems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RedeemDoc));
      setLoadingRedeems(false);
    }, () => setLoadingRedeems(false));
    return () => unsub();
  }, [uid]);

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login?from=logout");
  }

  const displayName = username || email?.split("@")[0] || "User";

  return (
    <div className="space-y-4 pb-4">

      {/* ── Avatar + Info ── */}
      <div className="rounded-2xl border border-white/10 bg-[#0f1218] p-5">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-16 h-16 rounded-full object-cover border-2 border-white/15 flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-600/80 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0 border-2 border-blue-500/30">
              {displayName[0]?.toUpperCase() ?? "U"}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-lg font-bold text-white truncate">@{displayName}</div>
            <div className="text-xs text-white/40 truncate mt-0.5">{email}</div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", isPremium ? "bg-amber-400/15 text-amber-300 border border-amber-400/30" : "bg-white/8 text-white/40 border border-white/10")}>
                {entLoading ? "···" : isPremium ? "✦ PREMIUM" : "FREE"}
              </span>
              <span className="rounded-full bg-amber-400/10 border border-amber-400/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                ◆ {entLoading ? "···" : Number(rewardPoints).toLocaleString()} RP
              </span>
              {isAdmin && (
                <span className="rounded-full bg-red-500/15 border border-red-500/30 px-2.5 py-0.5 text-[11px] font-bold text-red-300">
                  🛠️ Admin
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Menu ── */}
      <div className="rounded-2xl border border-white/10 bg-[#0f1218] overflow-hidden">
        {[
          { label: "Account Settings", sub: "Edit profile, avatar, address", href: "/settings/account", icon: "⚙️" },
          { label: "Subscription", sub: isPremium ? "Premium — active" : "Upgrade to Premium", href: "/subscription", icon: "⭐" },
          { label: "Store", sub: "Redeem your RP for rewards", href: "/store", icon: "🛒" },
        ].map(({ label, sub, href, icon }, i, arr) => (
          <Link key={href} href={href} className={cn("flex items-center justify-between px-5 py-4 hover:bg-white/5 transition", i < arr.length - 1 && "border-b border-white/8")}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/6 border border-white/8 flex items-center justify-center text-lg flex-shrink-0">{icon}</div>
              <div>
                <div className="text-sm font-semibold text-white">{label}</div>
                <div className="text-xs text-white/40 mt-0.5">{sub}</div>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/25 flex-shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        ))}
      </div>

      {/* ── Admin Panel — solo visible para admin ── */}
      {isAdmin && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-500/15 flex items-center gap-2">
            <span className="text-base">🛠️</span>
            <div>
              <div className="text-sm font-bold text-red-300">Admin Panel</div>
              <div className="text-xs text-white/35 mt-0.5">Only visible to you</div>
            </div>
          </div>
          {[
            { label: "Admin Dashboard", sub: "Sync games, finalize picks, manage users", href: "/admin", icon: "🎮" },
            { label: "Admin Games", sub: "Manage NBA, MLB & Soccer games", href: "/admin/games", icon: "🏆" },
            { label: "Admin Redeems", sub: "Process redemption requests", href: "/admin/redeems", icon: "🎁" },
          ].map(({ label, sub, href, icon }, i, arr) => (
            <Link key={href} href={href} className={cn("flex items-center justify-between px-5 py-4 hover:bg-red-500/8 transition", i < arr.length - 1 && "border-b border-red-500/10")}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-lg flex-shrink-0">{icon}</div>
                <div>
                  <div className="text-sm font-semibold text-white">{label}</div>
                  <div className="text-xs text-white/40 mt-0.5">{sub}</div>
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/25 flex-shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          ))}
        </div>
      )}

      {/* ── My Redeems ── */}
      <div className="rounded-2xl border border-white/10 bg-[#0f1218] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-white">My Redeems</div>
            <div className="text-xs text-white/40 mt-0.5">Store items you've redeemed</div>
          </div>
          <Link href="/redeems" className="text-xs text-blue-400 hover:text-blue-300 transition">View all →</Link>
        </div>
        {loadingRedeems ? (
          <div className="px-5 py-6 text-sm text-white/30 text-center">Loading…</div>
        ) : redeems.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <div className="text-2xl mb-2">🎁</div>
            <div className="text-sm text-white/40">No redeems yet</div>
            <Link href="/store" className="mt-3 inline-block text-xs text-blue-400 hover:text-blue-300">Browse the store →</Link>
          </div>
        ) : (
          <div className="divide-y divide-white/8">
            {redeems.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{r.title || r.productId}</div>
                  <div className="text-xs text-white/40 mt-0.5 flex items-center gap-1.5">
                    <span className="text-amber-300">{Number(r.pointsCost || 0).toLocaleString()} RP</span>
                    <span className="text-white/20">•</span>
                    <span>{formatDate(r.createdAt)}</span>
                  </div>
                </div>
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sign Out ── */}
      <button
        onClick={handleSignOut}
        className="w-full rounded-2xl border border-red-500/20 bg-red-500/8 py-3.5 text-sm font-semibold text-red-400 hover:bg-red-500/12 transition"
      >
        Sign out
      </button>

    </div>
  );
}
