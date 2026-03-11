"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type UserDoc = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  plan: string;
  points: number;
  createdAt?: any;
  updatedAt?: any;
};

export function useUserDoc(uid?: string | null) {
  const [data, setData] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState<boolean>(!!uid);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, "users", uid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? (snap.data() as UserDoc) : null);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  return { data, loading, error };
}