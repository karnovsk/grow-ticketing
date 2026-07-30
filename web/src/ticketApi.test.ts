import { describe, expect, test, vi } from 'vitest';

vi.mock('./firebaseClient', () => ({ functions: {}, db: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { ok: true } })),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({
    docs: [{ data: () => ({ ticketId: 't1', status: 'issued' }) }],
  }),
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({ ticketId: 't1', status: 'issued' }),
  }),
}));

import { getDoc } from 'firebase/firestore';
import { validateTicket, searchTicketsByField, getTicketById } from './ticketApi';

describe('validateTicket', () => {
  test('calls the validateTicketCallable with the ticket id', async () => {
    const result = await validateTicket('t1');
    expect(result).toEqual({ ok: true });
  });
});

describe('searchTicketsByField', () => {
  test('returns mapped ticket records from the query snapshot', async () => {
    const results = await searchTicketsByField('transactionCode', 'TX-1');
    expect(results).toEqual([{ ticketId: 't1', status: 'issued' }]);
  });
});

describe('getTicketById', () => {
  test('returns the ticket data when the document exists', async () => {
    const result = await getTicketById('t1');
    expect(result).toEqual({ ticketId: 't1', status: 'issued' });
  });

  test('returns null when the document does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false, data: () => undefined } as never);
    const result = await getTicketById('missing');
    expect(result).toBeNull();
  });
});
