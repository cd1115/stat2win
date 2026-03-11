import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getWeekId } from "@/lib/week";

/**
 * Crea N juegos “plantilla” en /games con spread/total para editar luego en Firestore.
 * - No toca dashboard
 * - Solo corre si tú llamas la función
 */

export type CreateNBATestGamesArgs = {
  count: number;           // 1..50
  homeTeam: string;        // "LAL"
  awayTeam: string;        // "GSW"
  spread: number;          // -5.5 (HOME line)
  total: number;           // 221.5
  createAsFinal?: boolean; // si quieres crear ya en final
};

export async function createNBATestGamesBatchFull(args: CreateNBATestGamesArgs) {
  const n = Math.max(1, Math.min(50, Number(args.count || 1)));

  const sport = "NBA";
  const weekId = getWeekId(new Date());

  const now = Date.now();
  const jobs: Promise<any>[] = [];

  for (let i = 0; i < n; i++) {
    const startAtDate = new Date(now + i * 60_000); // 1 min de diferencia
    const seedLabel = `${weekId}#${i + 1}`;

    // Genera el docRef primero para guardar gameId dentro del doc
    const ref = doc(collection(db, "games"));
    const gameId = ref.id;

    const docData: any = {
      gameId,
      sport,
      weekId,
      seedLabel,

      homeTeam: args.homeTeam,
      awayTeam: args.awayTeam,

      markets: {
        spread: { line: Number(args.spread) }, // HOME line
        total: { line: Number(args.total) },
      },

      scoreHome: args.createAsFinal ? 100 : 0,
      scoreAway: args.createAsFinal ? 90 : 0,

      status: args.createAsFinal ? "final" : "scheduled",

      startsAt: startAtDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    jobs.push(setDoc(ref, docData));
  }

  await Promise.all(jobs);
  return { created: n, weekId };
}

/** Alias para imports viejos */
export const createNBATestGamesBatch = createNBATestGamesBatchFull;
