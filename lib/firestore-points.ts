"use client";

import { doc, increment, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Suma puntos al usuario (users/{uid})
 */
export async function addPoints(uid: string, amount: number) {
  const ref = doc(db, "users", uid);

  await updateDoc(ref, {
    points: increment(amount),
    updatedAt: serverTimestamp(),
  });
}