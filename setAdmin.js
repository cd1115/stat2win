const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uid = "LzGfXrln7dWrPhSpNQodTnIWRVt1"; // <- pega tu UID

admin
  .auth()
  .setCustomUserClaims(uid, { admin: true })
  .then(async () => {
    console.log("✅ admin claim set for:", uid);

    // opcional (para UI): marcar también en Firestore
    await admin.firestore().doc(`users/${uid}`).set(
      {
        isAdmin: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log("✅ users/{uid}.isAdmin = true");
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  });
