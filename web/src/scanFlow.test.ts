import { describe, expect, test } from 'vitest';
import { resolveLookup, resolveConfirmOutcome } from './scanFlow';
import { TicketRecord } from './ticketApi';

const issuedTicket: TicketRecord = {
  ticketId: 't1',
  status: 'issued',
  customerName: 'Dana Levi',
  customerPhone: null,
  transactionCode: 'tx1',
  items: [{ name: 'Widget', quantity: 1 }],
  validatedAt: null,
  validatedBy: null,
};

const validatedTicket: TicketRecord = { ...issuedTicket, status: 'validated' };

describe('resolveLookup', () => {
  test('returns previewNotFound when no ticket exists', () => {
    expect(resolveLookup(null)).toEqual({ phase: 'previewNotFound' });
  });

  test('returns previewAlreadyValidated for an already-validated ticket', () => {
    expect(resolveLookup(validatedTicket)).toEqual({
      phase: 'previewAlreadyValidated',
      ticket: validatedTicket,
    });
  });

  test('returns preview for an issued ticket', () => {
    expect(resolveLookup(issuedTicket)).toEqual({ phase: 'preview', ticket: issuedTicket });
  });
});

describe('resolveConfirmOutcome', () => {
  test('returns result on success', () => {
    expect(resolveConfirmOutcome({ ok: true })).toBe('result');
  });

  test('returns resultAlreadyValidated on a race condition', () => {
    expect(resolveConfirmOutcome({ ok: false, reason: 'already_validated' })).toBe('resultAlreadyValidated');
  });

  test('returns previewNotFound for any other failure reason', () => {
    expect(resolveConfirmOutcome({ ok: false, reason: 'not_found' })).toBe('previewNotFound');
  });
});
