"use client";

/**
 * components/ui/AvatarPicker.tsx
 *
 * Selector de avatar:
 *  - Tab 1: Elegir preset  → imágenes en /public/avatars/
 *  - Tab 2: Subir foto     → sube a Firebase Storage avatars/users/{uid}/avatar
 *
 * Guarda en Firestore: users/{uid}.avatarUrl
 *
 * Uso en Settings:
 *   <AvatarPicker uid={uid} currentUrl={avatarUrl} onSaved={(url) => setAvatarUrl(url)} />
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "@/lib/firebase";
import { cn } from "@/lib/cn";

// ─── Tus avatars ──────────────────────────────────────────────────────────────
// Agrega aquí todos los que pongas en /public/avatars/
// El src debe coincidir exactamente con el nombre del archivo

const PRESET_AVATARS = [
  { src: "/avatars/5900_7_03.png",  label: "Baller" },
  { src: "/avatars/7500_5_02.png",  label: "Racer" },
  { src: "/avatars/7600_4_10.png",  label: "Pilot" },
  { src: "/avatars/9100_1_2_08.png", label: "Striker" },
  { src: "/avatars/18338.png",      label: "Shield" },
  // ← Agrega más aquí cuando tengas más imágenes
  // { src: "/avatars/tu_imagen.png", label: "Nombre" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AvatarPicker({
  uid,
  currentUrl,
  onSaved,
}: {
  uid: string | null;
  currentUrl?: string | null;
  onSaved?: (url: string) => void;
}) {
  const [tab, setTab]           = useState<"preset" | "upload">("preset");
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview]   = useState<string | null>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const displayUrl = preview ?? selected ?? currentUrl ?? null;
  const isDirty    = !!(selected || file);

  // ── File pick ──────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setError("La imagen debe ser menor a 2 MB."); return; }
    if (!f.type.startsWith("image/")) { setError("Solo se permiten imágenes."); return; }
    setError(null);
    setFile(f);
    setSelected(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!uid) return;
    setSaving(true);
    setError(null);
    try {
      let finalUrl = selected;

      if (file && tab === "upload") {
        setUploading(true);
        const storageRef = ref(storage, `avatars/users/${uid}/avatar`);
        await uploadBytes(storageRef, file, { contentType: file.type });
        finalUrl = await getDownloadURL(storageRef);
        setUploading(false);
      }

      if (!finalUrl) { setError("Selecciona un avatar primero."); setSaving(false); return; }

      await setDoc(
        doc(db, "users", uid),
        { avatarUrl: finalUrl, updatedAt: serverTimestamp() },
        { merge: true },
      );

      onSaved?.(finalUrl);
      setSaved(true);
      setFile(null);
      setPreview(null);
      setSelected(null);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Error al guardar.");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Preview actual ── */}
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          {displayUrl ? (
            <Image
              src={displayUrl}
              alt="Avatar"
              fill
              className="rounded-full object-cover border-2 border-white/15"
              unoptimized
            />
          ) : (
            <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/20 bg-white/[0.03] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/25">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Tu avatar</p>
          <p className="text-xs text-white/40 mt-0.5">Se muestra en el topbar y leaderboard</p>
          {isDirty && <p className="text-[11px] text-amber-400/80 mt-1">⚠ Cambios sin guardar</p>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex rounded-xl border border-white/10 overflow-hidden">
        {(["preset", "upload"] as const).map(t => (
          <button key={t} type="button" onClick={() => { setTab(t); setError(null); }}
            className={cn(
              "flex-1 py-2 text-xs font-semibold transition",
              tab === t
                ? "bg-blue-500/15 text-blue-300"
                : "text-white/45 hover:text-white/70 hover:bg-white/5",
            )}>
            {t === "preset" ? "🎮 Elegir avatar" : "📷 Subir foto"}
          </button>
        ))}
      </div>

      {/* ── PRESET TAB ── */}
      {tab === "preset" && (
        <div className="space-y-3">
          {PRESET_AVATARS.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
              <p className="text-xs text-white/30">Agrega imágenes a <code>/public/avatars/</code></p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
              {PRESET_AVATARS.map((av) => (
                <button
                  key={av.src}
                  type="button"
                  onClick={() => { setSelected(av.src); setFile(null); setPreview(null); }}
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 rounded-xl border p-2 transition",
                    selected === av.src
                      ? "border-blue-400/60 bg-blue-500/15 ring-1 ring-blue-400/30"
                      : "border-white/8 bg-white/[0.02] hover:border-white/20 hover:bg-white/5",
                  )}
                >
                  <div className="relative w-12 h-12">
                    <Image
                      src={av.src}
                      alt={av.label}
                      fill
                      className="rounded-full object-cover"
                      unoptimized
                    />
                  </div>
                  <span className="text-[9px] text-white/35 truncate w-full text-center">
                    {av.label}
                  </span>
                  {selected === av.src && (
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-white/20">
            Para agregar más avatars, pon las imágenes en <code className="text-white/35">/public/avatars/</code> y agrégalas al array en <code className="text-white/35">AvatarPicker.tsx</code>.
          </p>
        </div>
      )}

      {/* ── UPLOAD TAB ── */}
      {tab === "upload" && (
        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 cursor-pointer transition",
              preview
                ? "border-blue-400/40 bg-blue-500/5"
                : "border-white/15 hover:border-white/25 hover:bg-white/[0.02]",
            )}
          >
            {preview ? (
              <div className="relative w-20 h-20">
                <Image src={preview} alt="Preview" fill className="rounded-full object-cover" unoptimized />
              </div>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full border border-white/15 bg-white/5 flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white/70">Click para subir tu foto</p>
                  <p className="text-xs text-white/35 mt-0.5">PNG, JPG · Máx 2 MB</p>
                </div>
              </>
            )}
            {preview && (
              <p className="text-xs text-white/50">Imagen lista — haz click en Guardar</p>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          {preview && (
            <button type="button"
              onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
              className="text-xs text-white/40 hover:text-white/60 transition">
              Cambiar imagen
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-300">{error}</p>
      )}

      {/* Save */}
      <button type="button" onClick={handleSave}
        disabled={!isDirty || saving || !uid}
        className={cn(
          "w-full rounded-xl px-5 py-2.5 text-sm font-semibold transition",
          saved
            ? "bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 cursor-default"
            : isDirty && !saving
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "bg-white/5 border border-white/10 text-white/25 cursor-not-allowed",
        )}>
        {uploading ? "Subiendo imagen…" : saving ? "Guardando…" : saved ? "✓ Avatar guardado" : "Guardar avatar"}
      </button>

    </div>
  );
}
