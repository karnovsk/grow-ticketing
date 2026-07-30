import * as admin from 'firebase-admin';
import { createTicketIfNew, getTicketById, updateEmailStatus, validateTicket, invalidateTicket } from './ticketService';
import { db } from './admin';
import { clearFirestoreEmulator } from './testHelpers';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-grow-ticketing';

const sampleInput = {
  transactionCode: 'TX-1',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '0501234567',
  items: [{ name: 'Widget', quantity: 2 }],
  paymentSum: 99.9,
};

describe('ticketService', () => {
  afterEach(async () => {
    await clearFirestoreEmulator(PROJECT_ID);
  });

  afterAll(async () => {
    // terminate()/delete() close the Firestore client, but the underlying gRPC
    // channel's socket can outlive Jest's 1s open-handle check by a hair — that's
    // why test:emulator runs with --forceExit. Not a real leak; if a future test
    // file hangs for a different reason, --forceExit will mask it, so investigate
    // new hangs on their own merits rather than assuming this is the cause.
    await db.terminate();
    await admin.app().delete();
  });

  test('createTicketIfNew creates a ticket with status issued', async () => {
    const { ticket, created } = await createTicketIfNew(sampleInput);
    expect(created).toBe(true);
    expect(ticket.status).toBe('issued');
    expect(ticket.transactionCode).toBe('TX-1');
    expect(ticket.ticketId).toHaveLength(36);
  });

  test('createTicketIfNew returns the existing ticket without creating a duplicate', async () => {
    const first = await createTicketIfNew(sampleInput);
    const second = await createTicketIfNew(sampleInput);
    expect(second.created).toBe(false);
    expect(second.ticket.ticketId).toBe(first.ticket.ticketId);
  });

  test('createTicketIfNew creates separate tickets for different transactionCodes', async () => {
    const first = await createTicketIfNew(sampleInput);
    const second = await createTicketIfNew({ ...sampleInput, transactionCode: 'TX-2' });
    expect(second.created).toBe(true);
    expect(second.ticket.ticketId).not.toBe(first.ticket.ticketId);
  });

  test('createTicketIfNew only creates one ticket under truly concurrent calls', async () => {
    const [a, b] = await Promise.all([createTicketIfNew(sampleInput), createTicketIfNew(sampleInput)]);
    const createdCount = [a.created, b.created].filter(Boolean).length;
    expect(createdCount).toBe(1);
    expect(a.ticket.ticketId).toBe(b.ticket.ticketId);
  });

  test('getTicketById returns null for an unknown id', async () => {
    const found = await getTicketById('does-not-exist');
    expect(found).toBeNull();
  });

  test('updateEmailStatus updates the emailStatus field', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    await updateEmailStatus(ticket.ticketId, 'sent');
    const updated = await getTicketById(ticket.ticketId);
    expect(updated?.emailStatus).toBe('sent');
  });

  test('validateTicket transitions issued to validated', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    const result = await validateTicket(ticket.ticketId, 'staff-uid-1', 'staff1@example.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.status).toBe('validated');
      expect(result.ticket.validatedBy).toBe('staff-uid-1');
      expect(result.ticket.validatedByEmail).toBe('staff1@example.com');
    }
  });

  test('validateTicket stores a null validatedByEmail when the caller has none', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    const result = await validateTicket(ticket.ticketId, 'staff-uid-1', null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.validatedByEmail).toBeNull();
    }
  });

  test('validateTicket rejects an already-validated ticket', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    await validateTicket(ticket.ticketId, 'staff-uid-1', 'staff1@example.com');
    const result = await validateTicket(ticket.ticketId, 'staff-uid-2', 'staff2@example.com');
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'already_validated') {
      expect(result.ticket.validatedBy).toBe('staff-uid-1');
      expect(result.ticket.validatedByEmail).toBe('staff1@example.com');
    }
  });

  test('validateTicket returns not_found for an unknown id', async () => {
    const result = await validateTicket('does-not-exist', 'staff-uid-1', 'staff1@example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_found');
  });

  test('validateTicket stores a staff-provided note', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    const result = await validateTicket(ticket.ticketId, 'staff-uid-1', 'staff1@example.com', 'Bring gift bag');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ticket.validationNote).toBe('Bring gift bag');
  });

  test('invalidateTicket reverts a validated ticket to issued and clears validation fields', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    await validateTicket(ticket.ticketId, 'staff-uid-1', 'staff1@example.com');
    const result = await invalidateTicket(ticket.ticketId, 'staff-uid-2', 'staff2@example.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.status).toBe('issued');
      expect(result.ticket.validatedAt).toBeNull();
      expect(result.ticket.validatedBy).toBeNull();
      expect(result.ticket.validatedByEmail).toBeNull();
      expect(result.ticket.validationNote).toMatch(/Invalidated .* by staff2@example\.com/);
    }
  });

  test('invalidateTicket falls back to the uid when the caller has no email', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    await validateTicket(ticket.ticketId, 'staff-uid-1', 'staff1@example.com');
    const result = await invalidateTicket(ticket.ticketId, 'staff-uid-2', null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ticket.validationNote).toMatch(/Invalidated .* by staff-uid-2/);
  });

  test('invalidateTicket appends to an existing note rather than replacing it', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    await validateTicket(ticket.ticketId, 'staff-uid-1', 'staff1@example.com', 'Bring gift bag');
    const result = await invalidateTicket(ticket.ticketId, 'staff-uid-2', 'staff2@example.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.validationNote).toContain('Bring gift bag');
      expect(result.ticket.validationNote).toMatch(/Invalidated .* by staff2@example\.com/);
    }
  });

  test('a note from re-validating after invalidation is appended, not replacing history', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    await validateTicket(ticket.ticketId, 'staff-uid-1', 'staff1@example.com', 'First note');
    await invalidateTicket(ticket.ticketId, 'staff-uid-2', 'staff2@example.com');
    const result = await validateTicket(ticket.ticketId, 'staff-uid-3', 'staff3@example.com', 'Second note');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.validationNote).toContain('First note');
      expect(result.ticket.validationNote).toMatch(/Invalidated .* by staff2@example\.com/);
      expect(result.ticket.validationNote).toContain('Second note');
      // Order matters: history reads top-to-bottom as it happened.
      const note = result.ticket.validationNote as string;
      expect(note.indexOf('First note')).toBeLessThan(note.indexOf('Invalidated'));
      expect(note.indexOf('Invalidated')).toBeLessThan(note.indexOf('Second note'));
    }
  });

  test('invalidateTicket rejects a ticket that is still issued', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    const result = await invalidateTicket(ticket.ticketId, 'staff-uid-1', 'staff1@example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_validated');
  });

  test('invalidateTicket returns not_found for an unknown id', async () => {
    const result = await invalidateTicket('does-not-exist', 'staff-uid-1', 'staff1@example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_found');
  });
});
