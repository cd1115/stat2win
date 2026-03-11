// functions/scripts/check-admin.ts
import admin from "firebase-admin";

admin.initializeApp();

const uid = process.argv[2];
if (!uid) {
  console.error("Usage: npx ts-node scripts/check-admin.ts <UID>");
  process.exit(1);
}

async function main() {
  const u = await admin.auth().getUser(uid);
  console.log("UID:", u.uid);
  console.log("email:", u.email);
  console.log("customClaims:", u.customClaims || {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
