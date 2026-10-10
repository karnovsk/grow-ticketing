import { onRequest, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { handleGrowWebhook } from './webhookHandler';
import { handleValidateTicket, handleInvalidateTicket, handleResendTicketEmail } from './callables';
import { resolveRootRedirect } from './rootRedirect';
import { archiveOldTickets } from './archiveService';
import { growWebhookKeySecret, resendApiKeySecret } from './secrets';

// Hosting rewrites "/" here (see firebase.json) instead of hardcoding a
// destination there, so the redirect target stays per-deployment config
// (functions/.env's ROOT_REDIRECT_URL) rather than baked into the codebase.
export const rootRedirect = onRequest((req, res) => {
  const result = resolveRootRedirect();
  if (!result.location) {
    res.status(result.status).send('ROOT_REDIRECT_URL is not configured');
    return;
  }
  res.redirect(result.status, result.location);
});

// Bound secret matches the active EMAIL_PROVIDER (see functions/.env and email.ts).
// Switching EMAIL_PROVIDER back to 'gmail' requires re-adding
// `export const gmailAppPasswordSecret = defineSecret('GMAIL_APP_PASSWORD');` to secrets.ts
// and binding it in these two functions' secrets arrays instead.
export const growWebhook = onRequest({ secrets: [growWebhookKeySecret, resendApiKeySecret] }, async (req, res) => {
  const result = await handleGrowWebhook(req.body);
  res.status(result.status).json(result.body);
});

export const validateTicketCallable = onCall(async (request) => {
  return handleValidateTicket(
    request.data,
    request.auth ? { uid: request.auth.uid, email: request.auth.token.email ?? null } : undefined,
  );
});

export const invalidateTicketCallable = onCall(async (request) => {
  return handleInvalidateTicket(
    request.data,
    request.auth ? { uid: request.auth.uid, email: request.auth.token.email ?? null } : undefined,
  );
});

export const resendTicketEmailCallable = onCall({ secrets: [resendApiKeySecret] }, async (request) => {
  return handleResendTicketEmail(
    request.data,
    request.auth ? { uid: request.auth.uid, email: request.auth.token.email ?? null } : undefined,
  );
});

// Nightly, at an hour the venue is closed: moves old tickets out of `tickets`
// into `ticketsArchive` (see archiveService.ts). Thresholds, an on/off switch
// and a dry-run switch live in Firestore settings/archive.
export const archiveOldTicketsScheduled = onSchedule(
  { schedule: 'every day 05:00', timeZone: 'Asia/Jerusalem' },
  async () => {
    await archiveOldTickets();
  },
);
