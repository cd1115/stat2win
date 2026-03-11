import * as admin from "firebase-admin";
import * as path from "path";

function getArg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const uid = getArg("--uid");
const email = getArg("--email");

if (!uid && !email) {
  console.log('Uso: npx ts-node scripts/set-admin.ts --uid "<UID>"');
  console.log('  o : npx ts-node scripts/set-admin.ts --email "tu@email.com"');
  process.exit(1);
}

// OJO: este path es RELATIVO a /functions
const keyPath = path.resolve(process.cwd(), "serviceAccountKey.json");
const serviceAccount = require(keyPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function main() {
  const user = email
    ? await admin.auth().getUserByEmail(email)
    : await admin.auth().getUser(uid!);

  await admin.auth().setCustomUserClaims(user.uid, { admin: true });

  console.log("✅ admin:true seteado para:", user.uid, user.email);

  // opcional: verificar
  const again = await admin.auth().getUser(user.uid);
  console.log("Custom claims:", again.customClaims);
}

main().catch((e) => {
  console.error("❌ Error:", e?.message || e);
  process.exit(1);
});
