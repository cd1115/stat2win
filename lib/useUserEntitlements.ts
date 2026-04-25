"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, getIdTokenResult, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type Plan = "free" | "premium";

type EntitlementsState = {
  isAuthed: boolean;
  uid: string | null;
  email: string | null;
  plan: Plan;
  points: number;
  rewardPoints: number;
  isAdmin: boolean;
  loading: boolean;
};

/**
 * ✅ Singleton store:
 * - Guarantees only ONE auth listener + ONE userDoc snapshot across the whole app
 * - Any component can call useUserEntitlements() without creating extra listeners
 */

const initialState: EntitlementsState = {
  isAuthed: false,
  uid: null,
  email: null,
  plan: "free",
  points: 0,
  rewardPoints: 0,
  isAdmin: false,
  loading: true,
};

let currentState: EntitlementsState = initialState;

const listeners = new Set<(s: EntitlementsState) => void>();

let started = false;
let unsubAuth: null | (() => void) = null;
let unsubUserDoc: null | (() => void) = null;

function emit(next: EntitlementsState) {
  currentState = next;
  for (const cb of listeners) cb(currentState);
}

async function readAdminClaim(u: User) {
  try {
    const token = await getIdTokenResult(u, true);
    return Boolean(token?.claims?.admin);
  } catch {
    return false;
  }
}

function stopStore() {
  if (unsubUserDoc) {
    unsubUserDoc();
    unsubUserDoc = null;
  }
  if (unsubAuth) {
    unsubAuth();
    unsubAuth = null;
  }
  started = false;
}

function startStore() {
  if (started) return;
  started = true;

  let cachedClaimAdmin = false;

  unsubAuth = onAuthStateChanged(auth, async (u) => {
    if (unsubUserDoc) {
      unsubUserDoc();
      unsubUserDoc = null;
    }

    if (!u) {
      emit({
        isAuthed: false,
        uid: null,
        email: null,
        plan: "free",
        points: 0,
        rewardPoints: 0,
        isAdmin: false,
        loading: false,
      });
      return;
    }

    emit({
      ...currentState,
      isAuthed: true,
      uid: u.uid,
      email: u.email ?? null,
      loading: true,
    });

    cachedClaimAdmin = await readAdminClaim(u);

    const ref = doc(db, "users", u.uid);
    unsubUserDoc = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const plan = (data.plan === "premium" ? "premium" : "free") as Plan;
        const points = Number(data.points ?? 0);
        const rewardPoints = Number(data.rewardPoints ?? 0);

        const docAdmin = Boolean(data.isAdmin);
        const isAdmin = cachedClaimAdmin || docAdmin;

        emit({
          isAuthed: true,
          uid: u.uid,
          email: u.email ?? null,
          plan,
          points,
          rewardPoints,
          isAdmin,
          loading: false,
        });
      },
      () => {
        emit({
          isAuthed: true,
          uid: u.uid,
          email: u.email ?? null,
          plan: "free",
          points: 0,
          rewardPoints: 0,
          isAdmin: cachedClaimAdmin,
          loading: false,
        });
      }
    );
  });
}

function subscribe(cb: (s: EntitlementsState) => void) {
  listeners.add(cb);

  if (listeners.size === 1) startStore();

  cb(currentState);

  return () => {
    listeners.delete(cb);

    if (listeners.size === 0) stopStore();
  };
}

export function useUserEntitlements(): EntitlementsState {
  const [state, setState] = useState<EntitlementsState>(currentState);

  useEffect(() => {
    const unsub = subscribe(setState);
    return () => unsub();
  }, []);

  return state;
}