import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";

export async function getRewardHistory(uid: string) {
  const q = query(
    collection(db, "rewardHistory"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc"),
  );

  const snap = await getDocs(q);

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}
