"use client";

import Link from "next/link";

export default function ShippingRequiredModal({
  open,
  onClose,
  message,
}: {
  open: boolean;
  onClose: () => void;
  message?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />

      {/* panel */}
      <div className="relative mx-auto mt-24 w-[92%] max-w-md rounded-3xl border border-white/10 bg-[#0b1020]/90 p-6 backdrop-blur-xl shadow-2xl">
        <div className="text-xl font-semibold text-white">
          Add shipping address
        </div>
        <div className="mt-2 text-sm text-white/70">
          {message ??
            "Para canjear premios físicos, necesitamos tu dirección para el envío."}
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-white/60">
          Tip: puedes guardarla ahora en{" "}
          <span className="text-white/80">Settings</span> y luego vuelves al
          Store.
        </div>

        <div className="mt-6 flex gap-2">
          <Link
            href="/settings"
            className="flex-1 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 transition grid place-items-center text-sm font-semibold text-white"
          >
            Go to Settings
          </Link>

          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm font-semibold text-white"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
