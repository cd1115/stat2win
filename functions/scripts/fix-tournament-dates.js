/**
 * Fix paid tournament timestamps
 * Usage: node functions/scripts/fix-tournament-dates.js 2026-W17_MLB_PAID
 */

const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

function getWeekStartFromId(weekId) {
  // weekId = "2026-W17"
  const [yearStr, wStr] = weekId.split("-W");
  const year    = Number(yearStr);
  const weekNum = Number(wStr);

  // Jan 1 midnight PR = 04:00 UTC
  const jan1 = new Date(Date.UTC(year, 0, 1, 4, 0, 0, 0));

  // Find first Sunday of the year
  const jan1Day = jan1.toLocaleDateString("en-US", { timeZone: "America/Puerto_Rico", weekday: "short" });
  const dayMap  = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const jan1DayNum = dayMap[jan1Day] ?? 0;
  const firstSunday = new Date(jan1);
  firstSunday.setUTCDate(jan1.getUTCDate() - jan1DayNum);

  // Week start = firstSunday + (weekNum - 1) * 7 days
  const weekStart = new Date(firstSunday);
  weekStart.setUTCDate(firstSunday.getUTCDate() + (weekNum - 1) * 7);
  return weekStart;
}

async function main() {
  const tournamentId = process.argv[2];
  if (!tournamentId) {
    console.error("Usage: node fix-tournament-dates.js <tournamentId>");
    console.error("Example: node fix-tournament-dates.js 2026-W17_MLB_PAID");
    process.exit(1);
  }

  const ref  = db.collection("paid_tournaments").doc(tournamentId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`❌ Document '${tournamentId}' not found in paid_tournaments`);
    process.exit(1);
  }

  const data   = snap.data();
  const weekId = data.weekId;
  if (!weekId) {
    console.error("❌ Document has no weekId field");
    process.exit(1);
  }

  const weekStart = getWeekStartFromId(weekId);

  // endDate = Saturday 11:59:59pm PR = next Sunday 03:59:59 UTC
  const endDate = new Date(weekStart);
  endDate.setUTCDate(weekStart.getUTCDate() + 7);
  endDate.setUTCHours(3, 59, 59, 999);

  console.log(`📅 weekId:    ${weekId}`);
  console.log(`📅 startDate: ${weekStart.toISOString()} (Sunday 12:00am PR)`);
  console.log(`📅 endDate:   ${endDate.toISOString()}   (Saturday 11:59pm PR)`);

  await ref.set({
    startDate: admin.firestore.Timestamp.fromDate(weekStart),
    endDate:   admin.firestore.Timestamp.fromDate(endDate),
    deadline:  admin.firestore.Timestamp.fromDate(endDate),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`✅ Dates set on '${tournamentId}'`);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
