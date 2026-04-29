"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { cn } from "@/lib/cn";

type Address = {
  line1:   string;
  city:    string;
  state:   string;
  zip:     string;
  country: string;
};

const EMPTY_ADDRESS: Address = { line1: "", city: "", state: "", zip: "", country: "" };

function isValidAddress(a: Address) {
  return a.line1.trim().length > 3 && a.city.trim().length > 1 &&
    a.state.trim().length > 1 && a.zip.trim().length > 2 && a.country.trim().length > 1;
}

// ─── Reusable field components ────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-bold uppercase tracking-wider text-white/35 mb-1.5">{children}</label>;
}

function ReadonlyField({ value, icon, note }: { value: string; icon: string; note?: string }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.025] px-4 py-3 flex items-center gap-3">
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white/60 truncate">{value || "—"}</div>
        {note && <div className="text-[10px] text-white/25 mt-0.5">{note}</div>}
      </div>
      <span className="text-white/20 text-xs shrink-0">🔒</span>
    </div>
  );
}

function InputField({
  label, value, onChange, placeholder, type = "text", maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; maxLength?: number;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-blue-400/40 focus:bg-white/[0.05] transition-all"
      />
    </div>
  );
}

// ─── Save button ──────────────────────────────────────────────────────────────

function SaveBtn({ saving, saved, onClick, disabled }: {
  saving: boolean; saved: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className={cn(
        "w-full rounded-xl py-3 text-sm font-bold transition-all duration-200",
        saved
          ? "border border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
          : saving
            ? "border border-white/8 bg-white/5 text-white/30 cursor-not-allowed"
            : disabled
              ? "border border-white/5 bg-white/[0.02] text-white/20 cursor-not-allowed"
              : "border border-blue-400/25 bg-blue-500/10 text-blue-300 hover:bg-blue-500/15 active:scale-[0.98]"
      )}
    >
      {saved ? "✓ Guardado" : saving ? "Guardando…" : "Guardar cambios"}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountSettingsPage() {
  const router = useRouter();

  const [uid,         setUid]         = useState<string | null>(null);
  const [email,       setEmail]       = useState("");
  const [username,    setUsername]    = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone,       setPhone]       = useState("");
  const [address,     setAddress]     = useState<Address>(EMPTY_ADDRESS);
  const [loading,     setLoading]     = useState(true);

  // Profile save state
  const [profSaving,  setProfSaving]  = useState(false);
  const [profSaved,   setProfSaved]   = useState(false);

  // Address save state
  const [addrSaving,  setAddrSaving]  = useState(false);
  const [addrSaved,   setAddrSaved]   = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUid(u?.uid ?? null);
      setEmail(u?.email ?? "");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), snap => {
      const d = snap.data() as any ?? {};
      setUsername(d.username ?? "");
      setDisplayName(d.displayName ?? "");
      setPhone(d.phone ?? "");
      const a = d.address ?? {};
      setAddress({
        line1:   a.line1   ?? "",
        city:    a.city    ?? "",
        state:   a.state   ?? "",
        zip:     a.zip     ?? "",
        country: a.country ?? "",
      });
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);

  async function saveProfile() {
    if (!uid) return;
    setProfSaving(true);
    try {
      await setDoc(doc(db, "users", uid), {
        displayName: displayName.trim(),
        phone: phone.trim(),
        updatedAt: new Date(),
      }, { merge: true });
      setProfSaved(true);
      setTimeout(() => setProfSaved(false), 2500);
    } finally {
      setProfSaving(false);
    }
  }

  async function saveAddress() {
    if (!uid) return;
    setAddrSaving(true);
    try {
      await setDoc(doc(db, "users", uid), {
        address: {
          line1:   address.line1.trim(),
          city:    address.city.trim(),
          state:   address.state.trim(),
          zip:     address.zip.trim(),
          country: address.country.trim(),
        },
        updatedAt: new Date(),
      }, { merge: true });
      setAddrSaved(true);
      setTimeout(() => setAddrSaved(false), 2500);
    } finally {
      setAddrSaving(false);
    }
  }

  const addr = address;
  const addrComplete = isValidAddress(addr);

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-6 max-w-lg mx-auto">
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/4" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 max-w-lg mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-white/50 hover:bg-white/8 hover:text-white transition">
          ←
        </button>
        <div>
          <h1 className="text-xl font-black text-white">Mi Cuenta</h1>
          <p className="text-[11px] text-white/30">Perfil y dirección de envío</p>
        </div>
      </div>

      <div className="space-y-3">

        {/* ── Identity (locked) ── */}
        <div className="rounded-2xl border border-white/8 bg-[#0C0E14] overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 mb-3">Identidad</div>
            <div className="space-y-2.5">

              {/* Username locked */}
              <div>
                <FieldLabel>Username</FieldLabel>
                <ReadonlyField
                  value={username ? `@${username}` : "—"}
                  icon="🪪"
                  note="El username no se puede cambiar una vez registrado"
                />
              </div>

              {/* Email locked */}
              <div>
                <FieldLabel>Email</FieldLabel>
                <ReadonlyField
                  value={email}
                  icon="✉️"
                  note="El email está vinculado a tu cuenta"
                />
              </div>

            </div>
          </div>
          <div className="px-5 py-3 mt-1 border-t border-white/[0.05] flex items-center gap-2">
            <span className="text-[10px] text-white/20">🔒</span>
            <span className="text-[10px] text-white/20">Estos datos se establecen al registrarte y no pueden modificarse por seguridad.</span>
          </div>
        </div>

        {/* ── Profile (editable) ── */}
        <div className="rounded-2xl border border-white/8 bg-[#0C0E14] p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 mb-4">Perfil público</div>
          <div className="space-y-3.5">

            <InputField
              label="Nombre para mostrar"
              value={displayName}
              onChange={setDisplayName}
              placeholder="Tu nombre o apodo"
              maxLength={30}
            />

            <InputField
              label="Teléfono (opcional)"
              value={phone}
              onChange={setPhone}
              placeholder="+1 787 000 0000"
              type="tel"
              maxLength={20}
            />

          </div>
          <div className="mt-4">
            <SaveBtn saving={profSaving} saved={profSaved} onClick={saveProfile} />
          </div>
        </div>

        {/* ── Shipping address ── */}
        <div className="rounded-2xl border border-white/8 bg-[#0C0E14] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25">Dirección de envío</div>
              <div className="text-[11px] text-white/30 mt-0.5">Requerida para canjear premios físicos</div>
            </div>
            {addrComplete && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/8 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Completa
              </span>
            )}
          </div>

          <div className="space-y-3">

            <InputField
              label="Dirección / Calle"
              value={addr.line1}
              onChange={v => setAddress(a => ({ ...a, line1: v }))}
              placeholder="123 Calle Principal, Apt 4B"
              maxLength={80}
            />

            <div className="grid grid-cols-2 gap-3">
              <InputField
                label="Ciudad"
                value={addr.city}
                onChange={v => setAddress(a => ({ ...a, city: v }))}
                placeholder="San Juan"
                maxLength={40}
              />
              <InputField
                label="Estado / Provincia"
                value={addr.state}
                onChange={v => setAddress(a => ({ ...a, state: v }))}
                placeholder="PR"
                maxLength={40}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <InputField
                label="Código postal"
                value={addr.zip}
                onChange={v => setAddress(a => ({ ...a, zip: v }))}
                placeholder="00901"
                maxLength={12}
              />
              <InputField
                label="País"
                value={addr.country}
                onChange={v => setAddress(a => ({ ...a, country: v }))}
                placeholder="Puerto Rico"
                maxLength={40}
              />
            </div>

          </div>

          {/* Progress indicator */}
          <div className="mt-4 mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-white/25">Campos completados</span>
              <span className="text-[10px] font-bold text-white/35">
                {[addr.line1, addr.city, addr.state, addr.zip, addr.country].filter(v => v.trim().length > 0).length} / 5
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-white/6 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-400/50 transition-all duration-500"
                style={{ width: `${([addr.line1, addr.city, addr.state, addr.zip, addr.country].filter(v => v.trim().length > 0).length / 5) * 100}%` }}
              />
            </div>
          </div>

          <SaveBtn saving={addrSaving} saved={addrSaved} onClick={saveAddress} disabled={!addrComplete} />
        </div>

        {/* ── Danger zone ── */}
        <div className="rounded-2xl border border-white/6 bg-white/[0.015] p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/20 mb-3">Zona de peligro</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white/50">Eliminar cuenta</div>
              <div className="text-[11px] text-white/25 mt-0.5">Esta acción es permanente e irreversible</div>
            </div>
            <button
              className="rounded-xl border border-red-500/15 bg-red-500/5 px-4 py-2 text-xs font-bold text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition"
              onClick={() => alert("Contacta soporte para eliminar tu cuenta.")}
            >
              Eliminar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
