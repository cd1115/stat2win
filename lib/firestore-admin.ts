import { getFunctions, httpsCallable } from "firebase/functions";

type FinalizeGameInput = {
  gameId: string;
  winner: "home" | "away";
  homeScore?: number;
  awayScore?: number;
};

export async function finalizeGame(input: FinalizeGameInput) {
  const functions = getFunctions(undefined, "us-central1");
  const fn = httpsCallable(functions, "finalizeGame");
  const res = await fn(input);
  return res.data;
}
