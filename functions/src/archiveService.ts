import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from './admin';
import { getArchiveSettings } from './settings';
import { Ticket } from './types';

const COLLECTION = 'tickets';
// Where old tickets go. Nothing in the staff app or the callables reads this
// collection, and firestore.rules grants no access to it — so an archived
// ticket scans as "not found" and never shows up in search or the dashboard.
// It's kept (rather than deleted) as a record, reachable from the console.
export const ARCHIVE_COLLECTION = 'ticketsArchive';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 200;

export type ArchiveReason = 'picked_up' | 'unclaimed';

export interface ArchiveRunResult {
  enabled: boolean;
  dryRun: boolean;
  pickedUp: number;
  unclaimed: number;
}

// A ticket is due once it was picked up long enough ago, or — never picked
// up — was sold long enough ago. Checked again inside the move's transaction,
// since staff can validate or invalidate a ticket while a run is in flight.
function dueReason(ticket: Ticket, pickedUpBefore: Timestamp, unclaimedBefore: Timestamp): ArchiveReason | null {
  if (ticket.status === 'validated') {
    return ticket.validatedAt && ticket.validatedAt.toMillis() < pickedUpBefore.toMillis() ? 'picked_up' : null;
  }
  return ticket.issuedAt.toMillis() < unclaimedBefore.toMillis() ? 'unclaimed' : null;
}

async function moveToArchive(
  ticketId: string,
  pickedUpBefore: Timestamp,
  unclaimedBefore: Timestamp,
  archivedAt: Timestamp,
): Promise<ArchiveReason | null> {
  const ref = db.collection(COLLECTION).doc(ticketId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return null;
    const ticket = doc.data() as Ticket;
    const reason = dueReason(ticket, pickedUpBefore, unclaimedBefore);
    if (!reason) return null;
    tx.set(db.collection(ARCHIVE_COLLECTION).doc(ticketId), { ...ticket, archivedAt, archiveReason: reason });
    tx.delete(ref);
    return reason;
  });
}

// Moves every due ticket out of `tickets` into `ticketsArchive`. Thresholds
// and the on/off + dry-run switches come from Firestore settings/archive (see
// getArchiveSettings), so they can be changed without a redeploy. In a dry
// run nothing is written; the tickets that would move are only logged.
export async function archiveOldTickets(now: Date = new Date()): Promise<ArchiveRunResult> {
  const settings = await getArchiveSettings();
  const result: ArchiveRunResult = { enabled: settings.enabled, dryRun: settings.dryRun, pickedUp: 0, unclaimed: 0 };
  if (!settings.enabled) {
    logger.info('Ticket archiving is disabled (settings/archive.enabled is false); nothing done');
    return result;
  }

  const pickedUpBefore = Timestamp.fromMillis(now.getTime() - settings.pickedUpAfterDays * DAY_MS);
  const unclaimedBefore = Timestamp.fromMillis(now.getTime() - settings.unclaimedAfterDays * DAY_MS);
  const archivedAt = Timestamp.fromDate(now);

  // validatedAt is null on tickets that haven't been picked up, and a range
  // filter never matches null — so the first query is picked-up tickets only.
  // The second is ordered newest-first to match the existing composite index
  // (status ASC, issuedAt DESC — the one the dashboard's status filter uses).
  const queries = [
    db.collection(COLLECTION).where('validatedAt', '<', pickedUpBefore).orderBy('validatedAt'),
    db
      .collection(COLLECTION)
      .where('status', '==', 'issued')
      .where('issuedAt', '<', unclaimedBefore)
      .orderBy('issuedAt', 'desc'),
  ];

  for (const query of queries) {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    for (;;) {
      const page: FirebaseFirestore.QuerySnapshot = await (cursor ? query.startAfter(cursor) : query)
        .limit(PAGE_SIZE)
        .get();
      if (page.empty) break;
      cursor = page.docs[page.docs.length - 1];
      for (const doc of page.docs) {
        const reason = settings.dryRun
          ? dueReason(doc.data() as Ticket, pickedUpBefore, unclaimedBefore)
          : await moveToArchive(doc.id, pickedUpBefore, unclaimedBefore, archivedAt);
        if (!reason) continue;
        if (reason === 'picked_up') result.pickedUp += 1;
        else result.unclaimed += 1;
        if (settings.dryRun) logger.info('Dry run: would archive ticket', { ticketId: doc.id, reason });
      }
      if (page.size < PAGE_SIZE) break;
    }
  }

  logger.info(settings.dryRun ? 'Ticket archive dry run finished' : 'Ticket archive run finished', {
    ...result,
    pickedUpAfterDays: settings.pickedUpAfterDays,
    unclaimedAfterDays: settings.unclaimedAfterDays,
  });
  return result;
}
