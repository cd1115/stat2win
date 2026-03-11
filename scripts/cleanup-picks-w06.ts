import * as admin from "firebase-admin";
import fs from "fs";
import path from "path";

const WEEK_ID = "2026-W06";
const SPORT = "NBA";

function isEpochMs13(v: string) {
  return /^\d{13}$/.test(v);
}

function ensureAdmin() {
  if (admin.apps.length) return;

  const p = process.env.SERVICE_ACCOUNT_PATH || "./serviceAccount.json";
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);

  if (!fs.existsSync(abs)) {
    console.error(`❌ No encuentro service account JSON en: ${abs}`);
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(abs, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

async function main() {
  ensureAdmin();
  const db = admin.firestore();

  console.log("🔎 Buscando games malos…", { SPORT, WEEK_ID });

  const snap = await db
    .collection("games")
    .where("sport", "==", SPORT)
    .where("weekId", "==", WEEK_ID)
    .get();

  console.log(`📦 games encontrados: ${snap.size}`);

  const bad: string[] = [];

  for (const d of snap.docs) {
    const data = d.data() as any;
    const gid = String(data.gameId ?? "");

    // malos si gameId es timestamp
    if (gid && isEpochMs13(gid)) bad.push(d.id);

    // también malos si el docId termina en timestamp (NBA_2026-W06_1770...)
    const parts = d.id.split("_");
    const last = parts[parts.length - 1] ?? "";
    if (isEpochMs13(last)) bad.push(d.id);
  }

  const uniq = Array.from(new Set(bad));
  console.log(`🧨 games malos a borrar: ${uniq.length}`);

  if (uniq.length === 0) return;

  if (process.env.DRY_RUN === "1") {
    console.log("🟡 DRY_RUN=1 → no se borró nada. IDs:");
    console.log(uniq);
    return;
  }

  const chunkSize = 450;
  let deleted = 0;

  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const id of chunk) batch.delete(db.collection("games").doc(id));
    await batch.commit();
    deleted += chunk.length;
    console.log(`🗑️ Borrados ${deleted}/${uniq.length}`);
  }

  console.log("✅ Limpieza completa.");
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
