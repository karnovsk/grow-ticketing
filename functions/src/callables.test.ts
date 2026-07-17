import { createTicketIfNew } from './ticketService';
import { handleValidateTicket, handleResendTicketEmail } from './callables';
import { clearFirestoreEmulator } from './testHelpers';

jest.mock('./qr', () => ({ generateQrDataUri: jest.fn().mockResolvedValue('data:image/png;base64,ABC') }));
jest.mock('./email', () => ({ sendTicketEmail: jest.fn().mockResolvedValue(true) }));

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-grow-ticketing';

const sampleInput = {
  transactionCode: 'TX-200',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: null,
  items: [{ name: 'Widget', quantity: 1 }],
  paymentSum: 10,
};

describe('handleValidateTicket', () => {
  afterEach(async () => {
    await clearFirestoreEmulator(PROJECT_ID);
  });

  test('validates an issued ticket for an authenticated caller', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    const result = await handleValidateTicket({ ticketId: ticket.ticketId }, { uid: 'staff-1' });
    expect(result.ok).toBe(true);
  });

  test('throws unauthenticated when auth is missing', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    await expect(handleValidateTicket({ ticketId: ticket.ticketId }, undefined)).rejects.toThrow('unauthenticated');
  });

  test('throws ticket_not_found for an unknown id', async () => {
    await expect(handleValidateTicket({ ticketId: 'nope' }, { uid: 'staff-1' })).rejects.toThrow('ticket_not_found');
  });
});

describe('handleResendTicketEmail', () => {
  afterEach(async () => {
    await clearFirestoreEmulator(PROJECT_ID);
  });

  test('resends the email and updates emailStatus', async () => {
    const { ticket } = await createTicketIfNew({ ...sampleInput, transactionCode: 'TX-201' });
    const result = await handleResendTicketEmail({ ticketId: ticket.ticketId }, { uid: 'staff-1' });
    expect(result.sent).toBe(true);
  });

  test('throws unauthenticated when auth is missing', async () => {
    await expect(handleResendTicketEmail({ ticketId: 'any' }, undefined)).rejects.toThrow('unauthenticated');
  });
});
