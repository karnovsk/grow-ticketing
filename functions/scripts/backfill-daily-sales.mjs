// Rebuilds the dailySales collection (the Statistics tab's per-day totals)
// from the tickets collection. Run it once after first deploying the
// dailySales counter, so sales made before the counter existed are included;
// from then on createTicketIfNew keeps the totals up to date by itself.
//
// Reads `tickets` only, not `ticketsArchive` — when this was written nothing
// had been archived yet. Each day is overwritten (not incremented), so it's
// safe to re-run, but a sale landing mid-run can be overwritten — run it
// while the venue is closed, and re-run if in doubt.
//
// Needs Application Default Credentials (see README's note on
// `gcloud auth application-default login`) and a fresh `npm run build`, since
// it reuses the compiled salesDayKey from ../lib so day keys always match the
// live counter.
//
// Usage:
//   node scripts/backfill-daily-sales.mjs --project <projectId> [--dry-run]

import admin from 'firebase-admin';
import dailySales from '../lib/dailySales.js';

const { DAILY_SALES_COLLECTION, salesDayKey } = dailySales;
const BATCH_LIMIT = 500;

const args = process.argv.slice(2);
const projectIndex = args.indexOf('--project');
const projectId = projectIndex !== -1 ? args[projectIndex + 1] : undefined;
const dryRun = args.includes('--dry-run');

if (!projectId) {
  console.error('Usage: node scripts/backfill-daily-sales.mjs --project <projectId> [--dry-run]');
  process.exit(1);
}

admin.initializeApp({ projectId });
const db = admin.firestore();

const snap = await db.collection('tickets').get();
const days = new Map();
let totalTickets = 0;
let totalRevenue = 0;
for (const doc of snap.docs) {
  const { issuedAt, paymentSum } = doc.data();
  const date = salesDayKey(issuedAt.toDate());
  const day = days.get(date) ?? { date, tickets: 0, revenue: 0, updatedAt: issuedAt };
  day.tickets += 1;
  day.revenue += paymentSum;
  if (issuedAt.toMillis() > day.updatedAt.toMillis()) day.updatedAt = issuedAt;
  days.set(date, day);
  totalTickets += 1;
  totalRevenue += paymentSum;
}

const sorted = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
console.table(sorted.map(({ date, tickets, revenue }) => ({ date, tickets, revenue })));
console.log(`${sorted.length} sell days, ${totalTickets} tickets, revenue ${totalRevenue}`);

if (dryRun) {
  console.log('Dry run: nothing written.');
  process.exit(0);
}

for (let i = 0; i < sorted.length; i += BATCH_LIMIT) {
  const batch = db.batch();
  for (const day of sorted.slice(i, i + BATCH_LIMIT)) {
    batch.set(db.collection(DAILY_SALES_COLLECTION).doc(day.date), day);
  }
  await batch.commit();
}
console.log(`Wrote ${sorted.length} documents to ${DAILY_SALES_COLLECTION}.`);
