import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { archiveOldTickets, ARCHIVE_COLLECTION } from './archiveService';
import { createTicketIfNew, getTicketById, validateTicket } from './ticketService';
import { db } from './admin';
import { clearFirestoreEmulator } from './testHelpers';
import { Ticket } from './types';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-grow-ticketing';
const NOW = new Date('2026-10-11T03:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => Timestamp.fromMillis(NOW.getTime() - days * DAY_MS);

let counter = 0;

async function seedTicket(overrides: Partial<Ticket>): Promise<string> {
  counter += 1;
  const ticketId = `ticket-${counter}`;
  const ticket: Ticket = {
    ticketId,
    status: 'issued',
    transactionCode: `TX-${counter}`,
    customerName: 'Jane Doe',
    customerEmail: 'jane@example.com',
    customerPhone: null,
    items: [{ name: 'Widget', quantity: 1 }],
    paymentSum: 50,
    issuedAt: daysAgo(1),
    validatedAt: null,
    validatedBy: null,
    validatedByEmail: null,
    validationNote: null,
    emailStatus: 'sent',
    ...overrides,
  };
  await db.collection('tickets').doc(ticketId).set(ticket);
  return ticketId;
}

const pickedUp = (days: number, issuedDaysAgo = days + 1) =>
  seedTicket({ status: 'validated', issuedAt: daysAgo(issuedDaysAgo), validatedAt: daysAgo(days), validatedBy: 'staff-1' });
const unclaimed = (days: number) => seedTicket({ issuedAt: daysAgo(days) });

async function archived(ticketId: string) {
  const doc = await db.collection(ARCHIVE_COLLECTION).doc(ticketId).get();
  return doc.exists ? doc.data()! : null;
}

describe('archiveOldTickets', () => {
  afterEach(async () => {
    await clearFirestoreEmulator(PROJECT_ID);
  });

  afterAll(async () => {
    await db.terminate();
    await admin.app().delete();
  });

  test('archives a ticket picked up more than 50 days ago', async () => {
    const id = await pickedUp(51);
    const result = await archiveOldTickets(NOW);
    expect(result).toMatchObject({ pickedUp: 1, unclaimed: 0 });
    expect(await getTicketById(id)).toBeNull();
    const copy = await archived(id);
    expect(copy).toMatchObject({ ticketId: id, status: 'validated', archiveReason: 'picked_up', validatedBy: 'staff-1' });
    expect(copy!.archivedAt.toMillis()).toBe(NOW.getTime());
  });

  test('keeps a ticket picked up less than 50 days ago, however long ago it was sold', async () => {
    const id = await pickedUp(49, 400);
    const result = await archiveOldTickets(NOW);
    expect(result).toMatchObject({ pickedUp: 0, unclaimed: 0 });
    expect(await getTicketById(id)).not.toBeNull();
    expect(await archived(id)).toBeNull();
  });

  test('archives a never-picked-up ticket only after a year', async () => {
    const old = await unclaimed(366);
    const recent = await unclaimed(364);
    // Well past the picked-up threshold, but it was never picked up.
    const middling = await unclaimed(120);
    const result = await archiveOldTickets(NOW);
    expect(result).toMatchObject({ pickedUp: 0, unclaimed: 1 });
    expect(await archived(old)).toMatchObject({ status: 'issued', archiveReason: 'unclaimed' });
    expect(await getTicketById(recent)).not.toBeNull();
    expect(await getTicketById(middling)).not.toBeNull();
  });

  test('an archived ticket can no longer be validated', async () => {
    const id = await unclaimed(400);
    await archiveOldTickets(NOW);
    expect(await validateTicket(id, 'staff-1', null)).toEqual({ ok: false, reason: 'not_found' });
  });

  test('works through more tickets than fit in one page', async () => {
    const ids = await Promise.all(Array.from({ length: 230 }, () => pickedUp(60)));
    const result = await archiveOldTickets(NOW);
    expect(result.pickedUp).toBe(230);
    const left = await db.collection('tickets').get();
    expect(left.size).toBe(0);
    expect(await archived(ids[229])).not.toBeNull();
  }, 60000);

  test('dry run reports what would move without touching anything', async () => {
    await db.collection('settings').doc('archive').set({ dryRun: true });
    const a = await pickedUp(80);
    const b = await unclaimed(500);
    const result = await archiveOldTickets(NOW);
    expect(result).toEqual({ enabled: true, dryRun: true, pickedUp: 1, unclaimed: 1 });
    expect(await getTicketById(a)).not.toBeNull();
    expect(await getTicketById(b)).not.toBeNull();
    expect((await db.collection(ARCHIVE_COLLECTION).get()).size).toBe(0);
  });

  test('does nothing when disabled in settings', async () => {
    await db.collection('settings').doc('archive').set({ enabled: false });
    const id = await pickedUp(80);
    const result = await archiveOldTickets(NOW);
    expect(result).toEqual({ enabled: false, dryRun: false, pickedUp: 0, unclaimed: 0 });
    expect(await getTicketById(id)).not.toBeNull();
  });

  test('thresholds come from settings, ignoring non-positive values', async () => {
    await db.collection('settings').doc('archive').set({ pickedUpAfterDays: 10, unclaimedAfterDays: 0 });
    const tenDays = await pickedUp(11);
    const recentUnclaimed = await unclaimed(30);
    const result = await archiveOldTickets(NOW);
    expect(result).toMatchObject({ pickedUp: 1, unclaimed: 0 });
    expect(await archived(tenDays)).not.toBeNull();
    expect(await getTicketById(recentUnclaimed)).not.toBeNull();
  });

  test('a webhook replayed for an archived purchase resolves to the archived ticket, not a new one', async () => {
    const first = await createTicketIfNew({
      transactionCode: 'TX-REPLAY',
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: null,
      items: [{ name: 'Widget', quantity: 1 }],
      paymentSum: 50,
    });
    await db.collection('tickets').doc(first.ticket.ticketId).update({ issuedAt: daysAgo(400) });
    await archiveOldTickets(NOW);

    const replay = await createTicketIfNew({
      transactionCode: 'TX-REPLAY',
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: null,
      items: [{ name: 'Widget', quantity: 1 }],
      paymentSum: 50,
    });
    expect(replay.created).toBe(false);
    expect(replay.ticket.ticketId).toBe(first.ticket.ticketId);
    expect((await db.collection('tickets').get()).size).toBe(0);
  });
});
