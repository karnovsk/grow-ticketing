import { createTicketIfNew } from './ticketService';
import { handleValidateTicket, handleResendTicketEmail } from './callables';
import { sendTicketEmail } from './email';
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
    const result = await handleValidateTicket({ ticketId: ticket.ticketId }, { uid: 'staff-1', email: 'staff1@example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.validatedBy).toBe('staff-1');
      expect(result.ticket.validatedByEmail).toBe('staff1@example.com');
    }
  });

  test('throws unauthenticated when auth is missing', async () => {
    const { ticket } = await createTicketIfNew(sampleInput);
    await expect(handleValidateTicket({ ticketId: ticket.ticketId }, undefined)).rejects.toThrow('unauthenticated');
  });

  test('returns not_found without throwing for an unknown id', async () => {
    const result = await handleValidateTicket({ ticketId: 'nope' }, { uid: 'staff-1', email: 'staff1@example.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_found');
  });

  test('returns already_validated without throwing on a second validation', async () => {
    const { ticket } = await createTicketIfNew({ ...sampleInput, transactionCode: 'TX-210' });
    await handleValidateTicket({ ticketId: ticket.ticketId }, { uid: 'staff-1', email: 'staff1@example.com' });
    const result = await handleValidateTicket({ ticketId: ticket.ticketId }, { uid: 'staff-2', email: 'staff2@example.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('already_validated');
  });
});

describe('handleResendTicketEmail', () => {
  afterEach(async () => {
    await clearFirestoreEmulator(PROJECT_ID);
  });

  test('resends the email and updates emailStatus', async () => {
    const { ticket } = await createTicketIfNew({ ...sampleInput, transactionCode: 'TX-201' });
    const result = await handleResendTicketEmail({ ticketId: ticket.ticketId }, { uid: 'staff-1', email: 'staff1@example.com' });
    expect(result.sent).toBe(true);
  });

  test('throws unauthenticated when auth is missing', async () => {
    await expect(handleResendTicketEmail({ ticketId: 'any' }, undefined)).rejects.toThrow('unauthenticated');
  });

  test('reports sent:false and marks emailStatus failed when the email provider fails', async () => {
    const { ticket } = await createTicketIfNew({ ...sampleInput, transactionCode: 'TX-211' });
    (sendTicketEmail as jest.Mock).mockResolvedValueOnce(false);
    const result = await handleResendTicketEmail({ ticketId: ticket.ticketId }, { uid: 'staff-1', email: 'staff1@example.com' });
    expect(result.sent).toBe(false);
  });
});
