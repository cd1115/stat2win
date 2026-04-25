"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type AdminState = {
  loading: boolean;
  user: User | null;
  isAuthed: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
};

export function useAdmin(): AdminState {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  async function checkAdmin(u: User | null) {
    if (!u) {
      setIsAdmin(false);
      return;
    }

    // 1) ✅ Custom claim admin:true (lo más importante)
    try {
      const token = await u.getIdTokenResult(true); // force refresh por si acabas de setear claim
      if (token?.claims?.admin === true) {
        setIsAdmin(true);
        return;
      }
    } catch {
      // sigue abajo
    }

    // 2) (fallback) ✅ users/{uid}.isAdmin === true (solo por UI)
    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      const data = snap.exists() ? (snap.data() as any) : null;
      setIsAdmin(data?.isAdmin === true);
    } catch {
      setIsAdmin(false);
    }
  }

  async function refresh() {
    setLoading(true);
    const u = auth.currentUser;
    setUser(u);
    await checkAdmin(u);
    setLoading(false);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      setUser(u);
      await checkAdmin(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return {
    loading,
    user,
    isAuthed: !!user,
    isAdmin,
    refresh,
  };
}
