import { TicketRecord } from './ticketApi';

export type ScanState =
  | { phase: 'scanning' }
  | { phase: 'lookupError' }
  | { phase: 'previewNotFound' }
  | { phase: 'preview'; ticket: TicketRecord }
  | { phase: 'previewAlreadyValidated'; ticket: TicketRecord }
  | { phase: 'confirming'; ticket: TicketRecord }
  | { phase: 'result'; ticket: TicketRecord }
  | { phase: 'resultAlreadyValidated'; ticket: TicketRecord };

export function resolveLookup(ticket: TicketRecord | null): ScanState {
  if (!ticket) return { phase: 'previewNotFound' };
  if (ticket.status === 'validated') return { phase: 'previewAlreadyValidated', ticket };
  return { phase: 'preview', ticket };
}

export type ConfirmOutcome = { ok: boolean; reason?: string };

export function resolveConfirmOutcome(
  outcome: ConfirmOutcome,
): 'result' | 'resultAlreadyValidated' | 'previewNotFound' {
  if (outcome.ok) return 'result';
  if (outcome.reason === 'already_validated') return 'resultAlreadyValidated';
  return 'previewNotFound';
}
