import { doc, getDoc, serverTimestamp, updateDoc, increment, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getWeekId } from "@/lib/week";

type AddPointsArgs = {
  uid: string;
  amount: number; // ej: +5
  reason?: string;
  sport?: string;
};

export async function addWeeklyPoints({ uid, amount, reason, sport }: AddPointsArgs) {
  const userRef = doc(db, "users", uid);
  const weekId = getWeekId();

  const snap = await getDoc(userRef);

  // si no existe el doc, lo creamos mínimo (por si acaso)
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid,
      points: 0,
      weeklyPoints: 0,
      weeklyWeekId: weekId,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      plan: "free",
    });
  } else {
    const current = snap.data() as any;

    // si cambió la semana, resetea weeklyPoints a 0 y setea el weekId nuevo
    if (current.weeklyWeekId !== weekId) {
      await updateDoc(userRef, {
        weeklyPoints: 0,
        weeklyWeekId: weekId,
        updatedAt: serverTimestamp(),
      });
    }
  }

  // suma a weeklyPoints y al total points
  await updateDoc(userRef, {
    weeklyPoints: increment(amount),
    points: increment(amount),
    updatedAt: serverTimestamp(),
  });

  // log de movimientos (id estable)
  const logId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const logRef = doc(db, "users", uid, "pointsLog", logId);

  await setDoc(logRef, {
    amount,
    reason: reason ?? null,
    sport: sport ?? null,
    weekId,
    createdAt: serverTimestamp(),
  });
}
