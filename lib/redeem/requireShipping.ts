import { doc, getDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

type Address = {
  line1?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

function isValidShippingAddress(a?: Address | null) {
  if (!a) return false;

  // mínimo razonable para enviar
  const ok =
    (a.line1?.trim()?.length ?? 0) > 3 &&
    (a.city?.trim()?.length ?? 0) > 1 &&
    (a.state?.trim()?.length ?? 0) > 1 &&
    (a.zip?.trim()?.length ?? 0) > 2 &&
    (a.country?.trim()?.length ?? 0) > 1;

  return ok;
}

/**
 * Valida si el usuario tiene dirección (y si la requiere) antes de canjear premios físicos.
 * Retorna:
 *  - allowed: true si puede seguir
 *  - reason: texto si no puede
 */
export async function canRedeemPhysicalReward(db: Firestore, uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? (snap.data() as any) : null;

  const requireShipping = data?.preferences?.requireShippingForRewards ?? true;

  // si no requiere shipping, deja seguir aunque no tenga address
  if (!requireShipping) return { allowed: true as const };

  const ok = isValidShippingAddress(data?.address ?? null);

  if (!ok) {
    return {
      allowed: false as const,
      reason:
        "Necesitas añadir tu dirección de envío antes de canjear premios físicos.",
    };
  }

  return { allowed: true as const };
}
