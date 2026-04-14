"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { sendPasswordResetEmail, deleteUser } from "firebase/auth";

type Address = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

type UserSettings = {
  uid?: string;
  displayName?: string;
  username?: string;
  email?: string;
  address?: Address | null;
  preferences?: {
    timezone?: string;
    favoriteSport?: "NBA" | "NFL" | "MLB" | "SOCCER" | "MIXED";
    requireShippingForRewards?: boolean;
  };
  notifications?: {
    weeklyResults?: boolean;
    pickReminders?: boolean;
    productUpdates?: boolean;
  };
  updatedAt?: any;
};

const REDEEM_POINTS_COST = 5000;

// ─── UI Components ────────────────────────────────────────────────────────────

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[#0f1218] shadow-[0_0_0_1px_rgba(255,255,255,0.02)] ${className}`}
    >
      {children}
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="p-5 md:p-6">{children}</div>;
}

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-white/50">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-white/50 uppercase tracking-wider">
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/20 focus:ring-1 focus:ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-white/50 uppercase tracking-wider">
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#0b1220]">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs text-white/45">{description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border border-white/15 transition ${checked ? "bg-blue-500/40" : "bg-white/5"}`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[26px]" : "left-[3px]"}`}
        />
      </button>
    </div>
  );
}

function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
}) {
  const styles =
    variant === "primary"
      ? "bg-white text-black hover:bg-white/90"
      : variant === "danger"
        ? "bg-red-500/20 text-red-200 hover:bg-red-500/25 border border-red-500/30"
        : "bg-white/5 text-white hover:bg-white/10 border border-white/10";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus:outline-none ${styles} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

// ─── Avatar Component ─────────────────────────────────────────────────────────

function UserAvatar({
  name,
  email,
  size = 80,
}: {
  name: string;
  email: string;
  size?: number;
}) {
  const initials = name
    ? name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : email
      ? email[0].toUpperCase()
      : "?";

  const colors = [
    "from-blue-500 to-indigo-600",
    "from-purple-500 to-pink-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-red-500 to-rose-600",
  ];

  const colorIdx =
    (name || email).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    colors.length;
  const gradient = colors[colorIdx];

  return (
    <div
      className={`relative flex items-center justify-center rounded-full bg-gradient-to-br ${gradient} font-bold text-white shadow-lg ring-4 ring-white/10`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
      <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#0f1218] bg-emerald-500">
        <span className="text-[9px] text-white">✓</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { plan, points, loading: entLoading } = useUserEntitlements();

  const uid = user?.uid || null;
  const email = user?.email || "";
  const isPremium = plan === "premium";
  const canRedeem = points >= REDEEM_POINTS_COST && !isPremium;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState(0); // 0=idle, 1=first confirm, 2=second confirm
  const [deleting, setDeleting] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [timezone, setTimezone] = useState("America/Puerto_Rico");
  const [favoriteSport, setFavoriteSport] = useState<any>("NBA");
  const [weeklyResults, setWeeklyResults] = useState(true);
  const [pickReminders, setPickReminders] = useState(true);
  const [productUpdates, setProductUpdates] = useState(false);
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateProv, setStateProv] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("US");
  const [requireShippingForRewards, setRequireShippingForRewards] =
    useState(true);

  const docRef = useMemo(() => (uid ? doc(db, "users", uid) : null), [uid]);
  const hasAnyAddress = useMemo(
    () => line1.trim() || city.trim() || zip.trim(),
    [line1, city, zip],
  );

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      try {
        if (!docRef) return;
        const snap = await getDoc(docRef);
        const data = (snap.exists() ? snap.data() : {}) as UserSettings;
        if (!alive) return;
        setDisplayName(data.displayName || user?.displayName || "");
        setUsername(data.username || "");
        setTimezone(data.preferences?.timezone || "America/Puerto_Rico");
        setFavoriteSport((data.preferences?.favoriteSport as any) || "NBA");
        setWeeklyResults(data.notifications?.weeklyResults ?? true);
        setPickReminders(data.notifications?.pickReminders ?? true);
        setProductUpdates(data.notifications?.productUpdates ?? false);
        const a = data.address || null;
        setLine1(a?.line1 || "");
        setLine2(a?.line2 || "");
        setCity(a?.city || "");
        setStateProv(a?.state || "");
        setZip(a?.zip || "");
        setCountry(a?.country || "US");
        setRequireShippingForRewards(
          data.preferences?.requireShippingForRewards ?? true,
        );
      } catch (e: any) {
        if (alive) setErr(e?.message || "Failed to load settings.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [docRef, user?.displayName]);

  async function onSave() {
    if (!docRef || !uid) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await setDoc(
        docRef,
        {
          uid,
          email,
          displayName: displayName.trim(),
          ...(username ? { username: username.trim() } : {}),
          address: hasAnyAddress
            ? {
                line1: line1.trim(),
                line2: line2.trim(),
                city: city.trim(),
                state: stateProv.trim(),
                zip: zip.trim(),
                country: country.trim(),
              }
            : null,
          preferences: { timezone, favoriteSport, requireShippingForRewards },
          notifications: { weeklyResults, pickReminders, productUpdates },
          updatedAt: serverTimestamp(),
        } as any,
        { merge: true },
      );
      setMsg("Settings saved successfully.");
    } catch (e: any) {
      setErr(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteAccount() {
    if (deleteStep === 0) {
      setDeleteStep(1);
      return;
    }
    if (deleteStep === 1) {
      setDeleteStep(2);
      return;
    }

    // Step 2 = final confirmed
    setDeleting(true);
    setErr(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No user found.");
      await deleteUser(currentUser);
      // Redirect after deletion
      window.location.href = "/";
    } catch (e: any) {
      // Firebase requires recent login for deleteUser
      if (e?.code === "auth/requires-recent-login") {
        setErr(
          "For security, please log out and log back in before deleting your account.",
        );
      } else {
        setErr(e?.message || "Failed to delete account.");
      }
      setDeleteStep(0);
    } finally {
      setDeleting(false);
    }
  }

  async function onResetPassword() {
    setErr(null);
    setMsg(null);
    try {
      if (!email) throw new Error("No email found.");
      await sendPasswordResetEmail(auth, email);
      setMsg("Password reset email sent.");
    } catch (e: any) {
      setErr(e?.message || "Failed to send reset email.");
    }
  }

  return (
    <Protected>
      <div className="mx-auto w-full max-w-5xl px-4 md:px-6 pb-16">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pt-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Settings</h1>
            <p className="mt-1 text-sm text-white/50">
              Manage your profile, subscription, preferences and security.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Btn
              variant="ghost"
              onClick={() => location.reload()}
              disabled={saving || loading}
            >
              Refresh
            </Btn>
            <Btn onClick={onSave} disabled={saving || loading || !uid}>
              {saving ? "Saving…" : "Save changes"}
            </Btn>
          </div>
        </div>

        {/* Messages */}
        <div className="mt-4 space-y-3">
          {err && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {err}
            </div>
          )}
          {msg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              ✓ {msg}
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* ── LEFT COLUMN ─────────────────────────────────────────── */}
          <div className="lg:col-span-7 space-y-5">
            {/* Profile */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Profile"
                  subtitle="Basic account info shown across the app."
                />

                {/* Avatar */}
                <div className="mt-5 flex items-center gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <UserAvatar
                    name={displayName || username}
                    email={email}
                    size={64}
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {displayName || username || "Your name"}
                    </div>
                    <div className="text-xs text-white/45 mt-0.5">{email}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${isPremium ? "border-blue-400/30 bg-blue-500/15 text-blue-200" : "border-white/10 bg-white/5 text-white/50"}`}
                      >
                        {isPremium ? "✦ PREMIUM" : "FREE"}
                      </span>
                      <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        {points.toLocaleString()} RP
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label="Display name"
                    value={displayName}
                    onChange={setDisplayName}
                    placeholder="Your name"
                    disabled={loading}
                  />
                  <Input
                    label="Username"
                    value={username}
                    onChange={setUsername}
                    placeholder="e.g. christian059"
                    disabled={loading}
                  />
                  <div className="md:col-span-2">
                    <Input label="Email" value={email} disabled />
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Shipping Address */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Shipping address"
                  subtitle="Required for physical prize shipments."
                />
                <div className="mt-5 space-y-4">
                  <Input
                    label="Address line 1"
                    value={line1}
                    onChange={setLine1}
                    placeholder="123 Main St"
                    disabled={loading}
                  />
                  <Input
                    label="Address line 2 (optional)"
                    value={line2}
                    onChange={setLine2}
                    placeholder="Apt, Suite…"
                    disabled={loading}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="City"
                      value={city}
                      onChange={setCity}
                      placeholder="San Juan"
                      disabled={loading}
                    />
                    <Input
                      label="State / Province"
                      value={stateProv}
                      onChange={setStateProv}
                      placeholder="PR"
                      disabled={loading}
                    />
                    <Input
                      label="ZIP / Postal code"
                      value={zip}
                      onChange={setZip}
                      placeholder="00901"
                      disabled={loading}
                    />
                    <Input
                      label="Country"
                      value={country}
                      onChange={setCountry}
                      placeholder="US"
                      disabled={loading}
                    />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/45">
                    💡 Leave empty if you don't need physical rewards. You can
                    fill it later.
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Preferences */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Preferences"
                  subtitle="Customize your experience."
                />
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Select
                    label="Timezone"
                    value={timezone}
                    onChange={setTimezone}
                    options={[
                      {
                        value: "America/Puerto_Rico",
                        label: "Puerto Rico (AST)",
                      },
                      { value: "America/New_York", label: "New York (ET)" },
                      { value: "America/Chicago", label: "Chicago (CT)" },
                      { value: "America/Denver", label: "Denver (MT)" },
                      {
                        value: "America/Los_Angeles",
                        label: "Los Angeles (PT)",
                      },
                    ]}
                  />
                  <Select
                    label="Favorite sport"
                    value={favoriteSport || "NBA"}
                    onChange={(v) => setFavoriteSport(v)}
                    options={[
                      { value: "NBA", label: "NBA" },
                      { value: "MLB", label: "MLB" },
                      { value: "NFL", label: "NFL" },
                      { value: "SOCCER", label: "Soccer" },
                      { value: "MIXED", label: "Mixed" },
                    ]}
                  />
                </div>
                <div className="mt-4">
                  <Toggle
                    label="Require shipping address for physical rewards"
                    description="Ask for address before completing shipment rewards."
                    checked={requireShippingForRewards}
                    onChange={setRequireShippingForRewards}
                  />
                </div>
              </CardBody>
            </Card>

            {/* Notifications */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Notifications"
                  subtitle="Control what we notify you about."
                />
                <div className="mt-5 space-y-3">
                  <Toggle
                    label="Weekly results"
                    description="Get notified when weekly leaderboards are finalized."
                    checked={weeklyResults}
                    onChange={setWeeklyResults}
                  />
                  <Toggle
                    label="Pick reminders"
                    description="Reminders before games start so you don't miss picks."
                    checked={pickReminders}
                    onChange={setPickReminders}
                  />
                  <Toggle
                    label="Product updates"
                    description="New leagues, features and improvements."
                    checked={productUpdates}
                    onChange={setProductUpdates}
                  />
                </div>
              </CardBody>
            </Card>

            {/* ⚠️ Danger Zone */}
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-lg">⚠️</span>
                <div>
                  <div className="text-sm font-bold text-red-300">
                    Danger Zone
                  </div>
                  <div className="text-xs text-white/45 mt-0.5">
                    These actions are permanent and cannot be undone.
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-black/20 p-4">
                <div className="text-sm font-medium text-white">
                  Delete account
                </div>
                <div className="mt-1 text-xs text-white/50">
                  Permanently deletes your account, picks, rewards and all data.
                  This cannot be reversed.
                </div>

                {deleteStep === 0 && (
                  <button
                    onClick={onDeleteAccount}
                    className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 transition"
                  >
                    Delete my account
                  </button>
                )}

                {deleteStep === 1 && (
                  <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                    <div className="text-sm font-semibold text-red-200 mb-1">
                      ⚠️ Are you sure?
                    </div>
                    <div className="text-xs text-white/50 mb-3">
                      You will lose all your picks, reward points and
                      leaderboard history permanently.
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={onDeleteAccount}
                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 transition"
                      >
                        Yes, continue
                      </button>
                      <button
                        onClick={() => setDeleteStep(0)}
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {deleteStep === 2 && (
                  <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/15 p-4">
                    <div className="text-sm font-bold text-red-200 mb-1">
                      🚨 Final confirmation
                    </div>
                    <div className="text-xs text-white/60 mb-3">
                      This is your{" "}
                      <strong className="text-white">last chance</strong>. Once
                      deleted, your account{" "}
                      <strong className="text-red-300">
                        cannot be recovered
                      </strong>
                      .
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={onDeleteAccount}
                        disabled={deleting}
                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50 transition"
                      >
                        {deleting ? "Deleting…" : "Delete permanently"}
                      </button>
                      <button
                        onClick={() => setDeleteStep(0)}
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ────────────────────────────────────────── */}
          <div className="lg:col-span-5 space-y-5">
            {/* ✅ SUBSCRIPTION CARD */}
            <div
              className={`relative overflow-hidden rounded-2xl border p-5 ${isPremium ? "border-blue-500/30 bg-blue-500/5" : "border-white/10 bg-[#0f1218]"}`}
            >
              {isPremium && (
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl" />
              )}
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs font-medium text-white/40 uppercase tracking-wider">
                      Subscription
                    </div>
                    <div className="mt-1 text-lg font-bold text-white">
                      {entLoading ? "…" : isPremium ? "Premium" : "Free Plan"}
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${isPremium ? "border-blue-400/30 bg-blue-500/15 text-blue-200" : "border-white/10 bg-white/5 text-white/50"}`}
                  >
                    {isPremium ? "✦ Active" : "Standard"}
                  </span>
                </div>

                {isPremium ? (
                  <div className="space-y-2 mb-4">
                    {[
                      "Exclusive premium tournaments",
                      "2x reward points per win",
                      "Bigger weekly prizes",
                      "Premium store items",
                      "Ad-free experience",
                    ].map((f) => (
                      <div
                        key={f}
                        className="flex items-center gap-2 text-xs text-white/60"
                      >
                        <span className="text-blue-400">✓</span> {f}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mb-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="text-xs text-white/50 mb-1">
                      Upgrade to unlock
                    </div>
                    <div className="space-y-1">
                      {[
                        "Premium tournaments & bigger prizes",
                        "2x reward points per win",
                        "Ad-free experience",
                        "Premium store items",
                      ].map((f) => (
                        <div
                          key={f}
                          className="flex items-center gap-2 text-xs text-white/50"
                        >
                          <span className="text-white/20">→</span> {f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {!isPremium ? (
                    <Link
                      href="/subscription"
                      className="flex-1 rounded-xl bg-blue-600 py-2.5 text-center text-sm font-bold text-white hover:bg-blue-500 transition"
                    >
                      Upgrade — $4.99/mo
                    </Link>
                  ) : (
                    <button
                      onClick={() =>
                        alert("Stripe Customer Portal coming soon.")
                      }
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 transition"
                    >
                      Manage subscription
                    </button>
                  )}
                  <Link
                    href="/subscription"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/60 hover:bg-white/10 transition"
                  >
                    Details
                  </Link>
                </div>

                {/* ✅ Redeem free month */}
                <div
                  className={`mt-4 rounded-xl border p-4 ${canRedeem ? "border-amber-400/30 bg-amber-400/5" : "border-white/10 bg-black/10"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-white/70">
                      🎁 Free month with points
                    </div>
                    <span
                      className={`text-xs font-bold ${canRedeem ? "text-amber-300" : "text-white/30"}`}
                    >
                      {REDEEM_POINTS_COST.toLocaleString()} RP
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-3">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{
                        width: `${Math.min(100, (points / REDEEM_POINTS_COST) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/35 mb-3">
                    <span>{points.toLocaleString()} RP</span>
                    <span>
                      {canRedeem
                        ? "✅ Ready!"
                        : `${(REDEEM_POINTS_COST - points).toLocaleString()} more needed`}
                    </span>
                  </div>
                  <button
                    disabled={!canRedeem}
                    onClick={() => alert("Redeem free month coming soon.")}
                    className={`w-full rounded-xl py-2 text-xs font-bold transition ${canRedeem ? "bg-amber-500 hover:bg-amber-400 text-black" : "bg-white/5 text-white/25 cursor-not-allowed"}`}
                  >
                    {isPremium ? "Already Premium" : "Redeem Free Month"}
                  </button>
                </div>
              </div>
            </div>

            {/* Security */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Security"
                  subtitle="Keep your account safe."
                />
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">
                    Reset password
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    We'll send a reset link to{" "}
                    <span className="text-white/70">
                      {email || "your email"}
                    </span>
                    .
                  </div>
                  <div className="mt-4">
                    <Btn
                      onClick={onResetPassword}
                      variant="ghost"
                      disabled={!email}
                    >
                      Send reset email
                    </Btn>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Quick actions */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Quick actions"
                  subtitle="Common shortcuts."
                />
                <div className="mt-4 space-y-2">
                  {[
                    { label: "Browse Tournaments →", href: "/tournaments" },
                    { label: "View Leaderboard →", href: "/leaderboard" },
                    { label: "My Picks →", href: "/picks" },
                    { label: "Reward Store →", href: "/store" },
                  ].map((a) => (
                    <Link
                      key={a.href}
                      href={a.href}
                      className="flex w-full items-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 hover:bg-white/10 hover:text-white transition"
                    >
                      {a.label}
                    </Link>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>
        </div>

        {loading && (
          <div className="mt-6 text-sm text-white/40">Loading settings…</div>
        )}
      </div>
    </Protected>
  );
}
