// lib/ensureUserProfileClient.ts
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";

export async function ensureUserProfileClient() {
  // OJO: usa tu región real. En tu caso es us-central1.
  const functions = getFunctions(getApp(), "us-central1");
  const fn = httpsCallable(functions, "ensureUserProfile");
  await fn({});
}
