import {
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

export type ShippingAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string; // "PR", "US", etc.
};

export type CreateUserProfileInput = {
  username: string;
  firstName: string;
  lastName: string;
  address: ShippingAddress;
};

function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase();
}

// ✅ Crea /usernames/{uname} y /users/{uid} en una sola transacción
export async function createUserProfileWithUsername(
  db: Firestore,
  params: {
    uid: string;
    email: string;
    input: CreateUserProfileInput;
  }
) {
  const uname = normalizeUsername(params.input.username);

  // validación básica (sin espacios)
  if (!/^[a-z0-9._]{3,20}$/.test(uname)) {
    throw new Error("Username inválido. Usa 3-20: letras/números/punto/underscore.");
  }

  const usernameRef = doc(db, "usernames", uname);
  const userRef = doc(db, "users", params.uid);

  await runTransaction(db, async (tx) => {
    const usernameSnap = await tx.get(usernameRef);

    if (usernameSnap.exists()) {
      throw new Error("Ese username ya está cogido.");
    }

    // lock username
    tx.set(usernameRef, {
      uid: params.uid,
      createdAt: serverTimestamp(),
    });

    // perfil
    tx.set(userRef, {
      uid: params.uid,
      email: params.email,
      username: uname,
      firstName: params.input.firstName.trim(),
      lastName: params.input.lastName.trim(),
      address: {
        line1: params.input.address.line1.trim(),
        line2: (params.input.address.line2 || "").trim(),
        city: params.input.address.city.trim(),
        state: params.input.address.state.trim(),
        zip: params.input.address.zip.trim(),
        country: params.input.address.country.trim(),
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return uname;
}