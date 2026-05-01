"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { cn } from "@/lib/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

type MsgType = "announcement" | "update" | "info";

interface ChannelMessage {
  id: string;
  type: MsgType;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: any;
  authorUid?: string;
}

interface Reaction {
  id: string;       // `{msgId}_{uid}`
  msgId: string;
  uid: string;
  emoji: string;
}

const TYPE_CONFIG: Record<MsgType, { color: string; bg: string; border: string; icon: string; label: string }> = {
  announcement: { color: "#f59e0b", bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.22)", icon: "📣", label: "Anuncio" },
  update:       { color: "#3b82f6", bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.2)",  icon: "📊", label: "Actualización" },
  info:         { color: "#10b981", bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.2)",  icon: "⚡", label: "Novedad" },
};

const REACTION_EMOJIS = ["🔥", "💪", "🏆", "👀", "❤️"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeLabel(ts: any): string {
  try {
    const d: Date = ts?.toDate?.() ?? (ts instanceof Date ? ts : new Date(ts));
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60)    return "Ahora";
    if (diff < 3600)  return `Hace ${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  } catch { return ""; }
}

function formatBody(body: string) {
  return body.split("\n").map((line, i) =>
    line === ""
      ? <div key={i} style={{ height: 5 }} />
      : <div key={i} style={{ marginBottom: 1 }}>
          {line.split(/(\*\*.*?\*\*)/).map((seg, j) =>
            seg.startsWith("**") && seg.endsWith("**")
              ? <strong key={j} style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>{seg.slice(2, -2)}</strong>
              : seg
          )}
        </div>
  );
}

// ─── MessageCard ──────────────────────────────────────────────────────────────

function MessageCard({
  msg,
  uid,
  allReactions,
  myReactionEmoji,
  onReact,
}: {
  msg: ChannelMessage;
  uid: string;
  allReactions: Reaction[];
  myReactionEmoji: string | null;
  onReact: (emoji: string | null) => void;
}) {
  const cfg = TYPE_CONFIG[msg.type] ?? TYPE_CONFIG.info;
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Compute counts for this message
  const counts: Record<string, number> = {};
  allReactions.forEach(r => { counts[r.emoji] = (counts[r.emoji] ?? 0) + 1; });

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  function handleReact(emoji: string) {
    if (myReactionEmoji === emoji) {
      onReact(null); // remove
    } else {
      onReact(emoji);
    }
    setShowPicker(false);
  }

  const visibleCounts = REACTION_EMOJIS.filter(e => (counts[e] ?? 0) > 0);

  return (
    <div style={{
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
      position: "relative",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Pin badge */}
      {msg.pinned && (
        <div style={{
          position: "absolute", top: 11, right: 12,
          display: "flex", alignItems: "center", gap: 3,
          background: "rgba(245,158,11,0.13)", border: "1px solid rgba(245,158,11,0.28)",
          borderRadius: 8, padding: "2px 7px",
        }}>
          <span style={{ fontSize: 10 }}>📌</span>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#f59e0b" }}>FIJADO</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 9 }}>
        <div style={{
          width: 31, height: 31, borderRadius: 9, flexShrink: 0,
          background: `${cfg.color}22`, border: `1px solid ${cfg.color}45`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>
          {cfg.icon}
        </div>
        <div style={{ flex: 1, paddingRight: msg.pinned ? 60 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", lineHeight: 1.25 }}>{msg.title}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{timeLabel(msg.createdAt)}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", lineHeight: 1.65, marginBottom: 10 }}>
        {formatBody(msg.body)}
      </div>

      {/* Reactions row */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        {visibleCounts.map(emoji => (
          <button
            key={emoji}
            onClick={() => handleReact(emoji)}
            style={{
              display: "flex", alignItems: "center", gap: 3,
              background: myReactionEmoji === emoji ? `${cfg.color}28` : "rgba(255,255,255,0.05)",
              border: `1px solid ${myReactionEmoji === emoji ? cfg.color + "55" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 20, padding: "3px 9px", cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 13 }}>{emoji}</span>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: myReactionEmoji === emoji ? cfg.color : "rgba(255,255,255,0.45)",
            }}>
              {counts[emoji]}
            </span>
          </button>
        ))}

        {/* Add reaction */}
        <div ref={pickerRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowPicker(v => !v)}
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 20, padding: "3px 10px", cursor: "pointer",
              fontSize: 14, color: "rgba(255,255,255,0.35)",
            }}
          >
            ＋
          </button>
          {showPicker && (
            <div style={{
              position: "absolute", bottom: 36, left: 0, zIndex: 20,
              background: "#0E1117", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16, padding: "6px 8px", display: "flex", gap: 4,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}>
              {REACTION_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => handleReact(e)}
                  style={{
                    fontSize: 20, background: myReactionEmoji === e ? "rgba(255,255,255,0.1)" : "transparent",
                    border: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 8,
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChannelPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Auth
  useEffect(() => {
    return onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
  }, []);

  // Listen to messages
  useEffect(() => {
    const q = query(collection(db, "channel_messages"), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ChannelMessage));
      setLoading(false);
    });
  }, []);

  // Listen to all reactions
  useEffect(() => {
    return onSnapshot(collection(db, "channel_reactions"), snap => {
      setReactions(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Reaction));
    });
  }, []);

  // Mark channel as seen
  useEffect(() => {
    if (!uid) return;
    setDoc(doc(db, "channel_last_seen", uid), { uid, lastSeenAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }, [uid]);

  async function handleReact(msgId: string, emoji: string | null) {
    if (!uid) return;
    const reactionId = `${msgId}_${uid}`;
    const reactionDoc = doc(db, "channel_reactions", reactionId);

    if (emoji === null) {
      await deleteDoc(reactionDoc).catch(() => {});
    } else {
      await setDoc(reactionDoc, { msgId, uid, emoji }, { merge: false }).catch(() => {});
    }
  }

  // Pinned messages first, then by date
  const sorted = [...messages].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* Channel header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
        padding: "14px 16px",
        background: "rgba(9,9,12,0.8)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 13, flexShrink: 0,
          background: "linear-gradient(135deg,#0d1f3d,#1a3a6e)",
          border: "1px solid rgba(59,130,246,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
        }}>
          📣
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>Stat2Win Channel</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
            Solo admins pueden publicar · Tú puedes reaccionar
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.28)",
          borderRadius: 20, padding: "3px 10px",
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981" }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#10b981" }}>EN VIVO</span>
        </div>
      </div>

      {/* Messages */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
          Cargando mensajes…
        </div>
      ) : sorted.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 0",
          color: "rgba(255,255,255,0.2)", fontSize: 13,
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📣</div>
          Sin mensajes aún
        </div>
      ) : (
        sorted.map(msg => {
          const msgReactions = reactions.filter(r => r.msgId === msg.id);
          const myReaction = uid ? (reactions.find(r => r.msgId === msg.id && r.uid === uid)?.emoji ?? null) : null;
          return (
            <MessageCard
              key={msg.id}
              msg={msg}
              uid={uid ?? ""}
              allReactions={msgReactions}
              myReactionEmoji={myReaction}
              onReact={emoji => handleReact(msg.id, emoji)}
            />
          );
        })
      )}

      {/* Read-only notice */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, padding: "9px 12px", marginTop: 4,
      }}>
        <span style={{ fontSize: 14 }}>🔒</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          Solo el administrador puede publicar en este canal
        </span>
      </div>
    </div>
  );
}
