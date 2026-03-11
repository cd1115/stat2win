"use client";

import { useEffect, useMemo, useState } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

import {
  collection,
  getDocs,
  orderBy,
  query,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  where,
  documentId,
} from "firebase/firestore";

type RedeemStatus = "pending" | "shipped" | "delivered" | "cancelled";
type Carrier = "" | "USPS" | "UPS" | "FedEx" | "DHL";

type RedeemDoc = {
  id: string;
  uid: string;

  // item info (según tu modelo puede variar, los mostramos “safe”)
  itemId?: string;
  itemName?: string;
  title?: string;
  points?: number;

  // status/shipping
  status?: RedeemStatus;
  trackingNumber?: string;
  carrier?: Carrier;

  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
  shippedAt?: Timestamp | any;
  deliveredAt?: Timestamp | any;
};

function pill(status: RedeemStatus) {
  switch (status) {
    case "pending":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-200";
    case "shipped":
      return "border-blue-500/30 bg-blue-500/10 text-blue-200";
    case "delivered":
      return "border-green-500/30 bg-green-500/10 text-green-200";
    case "cancelled":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function fmtDate(v: any) {
  try {
    if (!v) return "—";
    const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

export default function AdminRedeemsPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RedeemDoc[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // uid -> username
  const [usernames, setUsernames] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState<
    Record<
      string,
      { status: RedeemStatus; carrier: Carrier; trackingNumber: string }
    >
  >({});

  const loadUsernames = async (uids: string[]) => {
    if (!uids.length) return;

    // Firestore where(documentId(), "in", [...]) tiene límite de 10
    const unique = Array.from(new Set(uids.filter(Boolean)));
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += 10)
      chunks.push(unique.slice(i, i + 10));

    const map: Record<string, string> = {};

    for (const chunk of chunks) {
      const q = query(
        collection(db, "users"),
        where(documentId(), "in", chunk),
      );
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const data: any = d.data();
        // ✅ aquí es donde asumimos el field username
        if (data?.username) map[d.id] = String(data.username);
      });
    }

    setUsernames(map);
  };

  const load = async () => {
    setLoading(true);
    try {
      const ref = collection(db, "redeems");
      const q = query(ref, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);

      const out: RedeemDoc[] = [];
      snap.forEach((d) => {
        const data: any = d.data();
        out.push({
          id: d.id,
          uid: data.uid,
          itemId: data.itemId,
          itemName: data.itemName,
          title: data.title,
          points: data.points ?? data.costPoints ?? data.pricePoints,
          status: (data.status ?? "pending") as RedeemStatus,
          trackingNumber: data.trackingNumber ?? "",
          carrier: (data.carrier ?? "") as Carrier,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          shippedAt: data.shippedAt,
          deliveredAt: data.deliveredAt,
        });
      });

      setRows(out);

      // ✅ cargar usernames en paralelo al render
      await loadUsernames(out.map((r) => r.uid));

      // inicializa draft
      const nextDraft: typeof draft = {};
      for (const r of out) {
        nextDraft[r.id] = {
          status: (r.status ?? "pending") as RedeemStatus,
          carrier: (r.carrier ?? "") as Carrier,
          trackingNumber: r.trackingNumber ?? "",
        };
      }
      setDraft(nextDraft);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const name = String(r.itemName ?? r.title ?? "").toLowerCase();
      const id = String(r.id).toLowerCase();
      const uid = String(r.uid).toLowerCase();
      const uname = String(usernames[r.uid] ?? "").toLowerCase();
      const tr = String(r.trackingNumber ?? "").toLowerCase();

      return (
        name.includes(q) ||
        id.includes(q) ||
        uid.includes(q) ||
        uname.includes(q) || // ✅ search por username
        tr.includes(q)
      );
    });
  }, [rows, search, usernames]);

  const saveRow = async (id: string) => {
    const d = draft[id];
    if (!d) return;

    setSavingId(id);
    try {
      const ref = doc(db, "redeems", id);

      const payload: any = {
        status: d.status,
        carrier: d.carrier,
        trackingNumber: d.trackingNumber.trim(),
        updatedAt: serverTimestamp(),
      };

      // set timestamps only on transitions
      if (d.status === "shipped") payload.shippedAt = serverTimestamp();
      if (d.status === "delivered") payload.deliveredAt = serverTimestamp();

      await updateDoc(ref, payload);
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const displayUser = (uid: string) => {
    const u = usernames[uid];
    if (u) return u;
    return uid ? `${uid.slice(0, 8)}…` : "—";
  };

  return (
    <Protected>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
          <div className="text-sm text-white/60">Admin</div>
          <h1 className="mt-2 text-3xl font-semibold text-white">Redeems</h1>
          <p className="mt-2 text-white/60">
            Manage user redeems — set status to shipped and add tracking.
          </p>

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-white/70">
              {loading ? "Loading..." : `${rows.length} redeem(s)`}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search (username, uid, item, tracking, id)..."
                className="w-96 max-w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none"
              />
              <button
                onClick={load}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
            <div className="grid grid-cols-12 gap-3 bg-white/[0.03] px-4 py-3 text-xs text-white/60">
              <div className="col-span-4">Item</div>
              <div className="col-span-2">User</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Tracking</div>
              <div className="col-span-2 text-right">Action</div>
            </div>

            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-white/60">
                No redeems found.
              </div>
            ) : (
              filtered.map((r) => {
                const d = draft[r.id] ?? {
                  status: "pending",
                  carrier: "",
                  trackingNumber: "",
                };
                const itemLabel = r.itemName ?? r.title ?? r.itemId ?? "—";
                const pts = r.points ?? 0;

                return (
                  <div
                    key={r.id}
                    className="grid grid-cols-12 gap-3 border-t border-white/10 px-4 py-4"
                  >
                    <div className="col-span-4">
                      <div className="text-sm font-semibold text-white">
                        {itemLabel}
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        Redeem ID: {r.id} • Points: {pts} • Created:{" "}
                        {fmtDate(r.createdAt)}
                      </div>
                      <div className="mt-1 text-xs text-white/40">
                        Shipped: {fmtDate(r.shippedAt)} • Delivered:{" "}
                        {fmtDate(r.deliveredAt)}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <div className="text-sm text-white">
                        {displayUser(r.uid)}
                      </div>
                      <div className="mt-1 text-xs text-white/40">
                        {r.uid.slice(0, 10)}…
                      </div>
                    </div>

                    <div className="col-span-2">
                      <select
                        value={d.status}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [r.id]: {
                              ...d,
                              status: e.target.value as RedeemStatus,
                            },
                          }))
                        }
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      >
                        <option value="pending">pending</option>
                        <option value="shipped">shipped</option>
                        <option value="delivered">delivered</option>
                        <option value="cancelled">cancelled</option>
                      </select>

                      <div
                        className={`mt-2 inline-flex items-center rounded-full border px-3 py-1 text-xs ${pill(
                          d.status,
                        )}`}
                      >
                        {d.status}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <select
                        value={d.carrier}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [r.id]: {
                              ...d,
                              carrier: e.target.value as Carrier,
                            },
                          }))
                        }
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      >
                        <option value="">Carrier</option>
                        <option value="USPS">USPS</option>
                        <option value="UPS">UPS</option>
                        <option value="FedEx">FedEx</option>
                        <option value="DHL">DHL</option>
                      </select>

                      <input
                        value={d.trackingNumber}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [r.id]: { ...d, trackingNumber: e.target.value },
                          }))
                        }
                        placeholder="Tracking #"
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none"
                      />
                    </div>

                    <div className="col-span-2 flex justify-end">
                      <button
                        onClick={() => saveRow(r.id)}
                        disabled={savingId === r.id}
                        className={`rounded-2xl px-4 py-2 text-sm ${
                          savingId === r.id
                            ? "cursor-not-allowed bg-white/10 text-white/50"
                            : "bg-white/15 text-white hover:bg-white/20"
                        }`}
                      >
                        {savingId === r.id ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 text-xs text-white/40">
            Note: updates are allowed only for admin (Firestore rules:{" "}
            <code className="text-white/60">allow update: if isAdmin()</code>).
          </div>
        </div>
      </div>
    </Protected>
  );
}
