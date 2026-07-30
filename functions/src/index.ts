import { onRequest, onCall } from 'firebase-functions/v2/https';
import { handleGrowWebhook } from './webhookHandler';
import { handleValidateTicket, handleInvalidateTicket, handleResendTicketEmail } from './callables';
import { growWebhookKeySecret, gmailAppPasswordSecret } from './secrets';

// Bound secret matches the active EMAIL_PROVIDER (see functions/.env and email.ts).
// Switching EMAIL_PROVIDER back to 'resend' also requires re-adding
// `export const resendApiKeySecret = defineSecret('RESEND_API_KEY');` to secrets.ts
// and binding it in these two functions' secrets arrays.
export const growWebhook = onRequest({ secrets: [growWebhookKeySecret, gmailAppPasswordSecret] }, async (req, res) => {
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

export const resendTicketEmailCallable = onCall({ secrets: [gmailAppPasswordSecret] }, async (request) => {
  return handleResendTicketEmail(
    request.data,
    request.auth ? { uid: request.auth.uid, email: request.auth.token.email ?? null } : undefined,
  );
});
