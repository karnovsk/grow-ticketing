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
}));

import { validateTicket, searchTicketsByField } from './ticketApi';

describe('validateTicket', () => {
  test('calls the validateTicketCallable with the ticket id', async () => {
    const result = await validateTicket('t1');
    expect(result).toEqual({ ok: true });
  });
});

describe('searchTicketsByField', () => {
  test('returns mapped ticket records from the query snapshot', async () => {
    const results = await searchTicketsByField('customerPhone', '0501234567');
    expect(results).toEqual([{ ticketId: 't1', status: 'issued' }]);
  });
});
