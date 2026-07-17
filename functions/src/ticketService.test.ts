import * as admin from 'firebase-admin';
import {
  createTicket,
  findTicketByTransactionCode,
  getTicketById,
  updateEmailStatus,
  validateTicket,
} from './ticketService';
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

  test('createTicket writes a ticket with status issued', async () => {
    const ticket = await createTicket(sampleInput);
    expect(ticket.status).toBe('issued');
    expect(ticket.transactionCode).toBe('TX-1');
    expect(ticket.ticketId).toHaveLength(36);
  });

  test('findTicketByTransactionCode finds an existing ticket', async () => {
    const created = await createTicket(sampleInput);
    const found = await findTicketByTransactionCode('TX-1');
    expect(found?.ticketId).toBe(created.ticketId);
  });

  test('findTicketByTransactionCode returns null when not found', async () => {
    const found = await findTicketByTransactionCode('NOPE');
    expect(found).toBeNull();
  });

  test('getTicketById returns null for an unknown id', async () => {
    const found = await getTicketById('does-not-exist');
    expect(found).toBeNull();
  });

  test('updateEmailStatus updates the emailStatus field', async () => {
    const ticket = await createTicket(sampleInput);
    await updateEmailStatus(ticket.ticketId, 'sent');
    const updated = await getTicketById(ticket.ticketId);
    expect(updated?.emailStatus).toBe('sent');
  });

  test('validateTicket transitions issued to validated', async () => {
    const ticket = await createTicket(sampleInput);
    const result = await validateTicket(ticket.ticketId, 'staff-uid-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.status).toBe('validated');
      expect(result.ticket.validatedBy).toBe('staff-uid-1');
    }
  });

  test('validateTicket rejects an already-validated ticket', async () => {
    const ticket = await createTicket(sampleInput);
    await validateTicket(ticket.ticketId, 'staff-uid-1');
    const result = await validateTicket(ticket.ticketId, 'staff-uid-2');
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'already_validated') {
      expect(result.ticket.validatedBy).toBe('staff-uid-1');
    }
  });

  test('validateTicket returns not_found for an unknown id', async () => {
    const result = await validateTicket('does-not-exist', 'staff-uid-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_found');
  });

});
