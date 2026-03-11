"use client";

import { useEffect, useMemo, useState } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";

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
    // recomendado para envíos físicos (no rompe nada si no lo usas aún)
    requireShippingForRewards?: boolean;
  };

  notifications?: {
    weeklyResults?: boolean;
    pickReminders?: boolean;
    productUpdates?: boolean;
  };

  updatedAt?: any;
};

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
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-white/60">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-xl">
      {children}
    </div>
  );
}
function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="p-5 md:p-6">{children}</div>;
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
      <div className="mb-2 text-sm text-white/70">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={[
          "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none",
          "placeholder:text-white/35 focus:border-white/20 focus:ring-2 focus:ring-white/10",
          disabled ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
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
      <div className="mb-2 text-sm text-white/70">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-white/20 focus:ring-2 focus:ring-white/10"
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
    <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        {description ? (
          <div className="mt-1 text-xs text-white/60">{description}</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={[
          "relative h-6 w-11 rounded-full border border-white/15 transition",
          checked ? "bg-blue-500/30" : "bg-white/5",
        ].join(" ")}
        aria-pressed={checked}
      >
        <span
          className={[
            "absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white transition",
            checked ? "left-5" : "left-1",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function Button({
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
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-white/10";
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
      className={[
        base,
        styles,
        disabled ? "opacity-60 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();

  const uid = user?.uid || null;
  const email = user?.email || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // form state
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [timezone, setTimezone] = useState("America/Puerto_Rico");
  const [favoriteSport, setFavoriteSport] = useState<
    UserSettings["preferences"] extends infer P
      ? P extends { favoriteSport?: infer S }
        ? S
        : any
      : any
  >("NBA" as any);

  const [weeklyResults, setWeeklyResults] = useState(true);
  const [pickReminders, setPickReminders] = useState(true);
  const [productUpdates, setProductUpdates] = useState(false);

  // ✅ Shipping address
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateProv, setStateProv] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("US");

  // ✅ Recommended (future): require address for physical rewards
  const [requireShippingForRewards, setRequireShippingForRewards] =
    useState(true);

  const docRef = useMemo(() => {
    if (!uid) return null;
    return doc(db, "users", uid);
  }, [uid]);

  const hasAnyAddress = useMemo(() => {
    return (
      line1.trim() ||
      line2.trim() ||
      city.trim() ||
      stateProv.trim() ||
      zip.trim() ||
      country.trim()
    );
  }, [line1, line2, city, stateProv, zip, country]);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr(null);
      setMsg(null);

      try {
        if (!docRef) return;

        const snap = await getDoc(docRef);
        const data = (
          snap.exists() ? (snap.data() as UserSettings) : {}
        ) as UserSettings;

        if (!alive) return;

        setDisplayName(data.displayName || user?.displayName || "");
        setUsername(data.username || "");
        setTimezone(data.preferences?.timezone || "America/Puerto_Rico");
        setFavoriteSport(
          (data.preferences?.favoriteSport as any) || ("NBA" as any),
        );

        setWeeklyResults(data.notifications?.weeklyResults ?? true);
        setPickReminders(data.notifications?.pickReminders ?? true);
        setProductUpdates(data.notifications?.productUpdates ?? false);

        // ✅ address load
        const a = (data.address || null) as Address | null;
        setLine1(a?.line1 || "");
        setLine2(a?.line2 || "");
        setCity(a?.city || "");
        setStateProv(a?.state || "");
        setZip(a?.zip || "");
        setCountry(a?.country || "US");

        // ✅ recommended flag load (default true)
        setRequireShippingForRewards(
          data.preferences?.requireShippingForRewards ?? true,
        );
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load settings.");
      } finally {
        if (!alive) return;
        setLoading(false);
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
      const payload: UserSettings = {
        uid: uid as any,
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
        preferences: {
          timezone,
          favoriteSport: favoriteSport as any,
          requireShippingForRewards,
        },
        notifications: {
          weeklyResults,
          pickReminders,
          productUpdates,
        },
        updatedAt: serverTimestamp(),
      };

      await setDoc(docRef, payload as any, { merge: true });
      setMsg("Saved.");
    } catch (e: any) {
      setErr(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function onResetPassword() {
    setErr(null);
    setMsg(null);

    try {
      if (!email) throw new Error("No email found for this account.");
      await sendPasswordResetEmail(auth, email);
      setMsg("Password reset email sent.");
    } catch (e: any) {
      setErr(e?.message || "Failed to send reset email.");
    }
  }

  return (
    <Protected>
      <div className="mx-auto w-full max-w-5xl px-4 md:px-6 pb-16">
        <div className="pt-8">
          <SectionTitle
            title="Settings"
            subtitle="Manage your profile, preferences, notifications, and security."
            right={
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => location.reload()}
                  disabled={saving || loading}
                >
                  Refresh
                </Button>
                <Button onClick={onSave} disabled={saving || loading || !uid}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            }
          />
        </div>

        <div className="mt-4">
          {err ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {err}
            </div>
          ) : null}
          {msg ? (
            <div className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              {msg}
            </div>
          ) : null}
        </div>

        {/* Grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left column */}
          <div className="lg:col-span-7 space-y-6">
            {/* Profile */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Profile"
                  subtitle="Basic account details shown across the app."
                />
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
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

            {/* ✅ Shipping Address */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Shipping address"
                  subtitle="Needed for physical rewards shipments."
                />
                <div className="mt-5 grid grid-cols-1 gap-4">
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
                    placeholder="Apt, Suite, etc."
                    disabled={loading}
                  />
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-sm font-medium text-white">Tip</div>
                    <div className="mt-1 text-xs text-white/60">
                      If you leave it empty, we store{" "}
                      <span className="text-white/80">address: null</span>. You
                      can fill it later when redeeming a physical prize.
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Preferences */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Preferences"
                  subtitle="Customize your tournament experience."
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
                    value={(favoriteSport as any) || "NBA"}
                    onChange={(v) => setFavoriteSport(v as any)}
                    options={[
                      { value: "NBA", label: "NBA" },
                      { value: "NFL", label: "NFL" },
                      { value: "MLB", label: "MLB" },
                      { value: "SOCCER", label: "Soccer" },
                      { value: "MIXED", label: "Mixed" },
                    ]}
                  />
                </div>

                {/* ✅ recommended toggle */}
                <div className="mt-4">
                  <Toggle
                    label="Require shipping address for physical rewards"
                    description="When enabled, redeem flow should ask for address before completing shipment rewards."
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
                  subtitle="Control what we send you."
                />
                <div className="mt-5 grid grid-cols-1 gap-3">
                  <Toggle
                    label="Weekly results"
                    description="Get notified when weekly leaderboards are finalized."
                    checked={weeklyResults}
                    onChange={setWeeklyResults}
                  />
                  <Toggle
                    label="Pick reminders"
                    description="Reminders before games start so you don’t miss picks."
                    checked={pickReminders}
                    onChange={setPickReminders}
                  />
                  <Toggle
                    label="Product updates"
                    description="New leagues, features, and improvements."
                    checked={productUpdates}
                    onChange={setProductUpdates}
                  />
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Right column */}
          <div className="lg:col-span-5 space-y-6">
            {/* Billing */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Subscription"
                  subtitle="Unlock tournaments, leaderboards, and premium features."
                />
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm text-white/60">Current plan</div>
                      <div className="mt-1 text-base font-semibold text-white">
                        Stat2Win Pro
                      </div>
                      <div className="mt-1 text-sm text-white/60">
                        $9.99 / month • Cancel anytime
                      </div>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                      Active
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      onClick={() => alert("Hook this to Stripe later")}
                      variant="primary"
                    >
                      Manage billing
                    </Button>
                    <Button
                      onClick={() => alert("Hook cancel to Stripe later")}
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Security */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Security"
                  subtitle="Keep your account safe."
                />
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">
                    Reset password
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    We’ll send a reset link to{" "}
                    <span className="text-white/80">
                      {email || "your email"}
                    </span>
                    .
                  </div>
                  <div className="mt-4">
                    <Button
                      onClick={onResetPassword}
                      variant="ghost"
                      disabled={!email}
                    >
                      Send reset email
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardBody>
                <SectionTitle
                  title="Quick actions"
                  subtitle="Common shortcuts."
                />
                <div className="mt-5 grid grid-cols-1 gap-2">
                  <button
                    onClick={() => (location.href = "/tournaments")}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white hover:bg-white/10"
                  >
                    Go to Tournaments →
                  </button>
                  <button
                    onClick={() => (location.href = "/leaderboard")}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white hover:bg-white/10"
                  >
                    View Leaderboard →
                  </button>
                  <button
                    onClick={() => (location.href = "/picks")}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white hover:bg-white/10"
                  >
                    My Picks →
                  </button>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-white/50">Loading settings...</div>
        ) : null}
      </div>
    </Protected>
  );
}
