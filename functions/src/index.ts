import { onRequest, onCall } from 'firebase-functions/v2/https';
import { handleGrowWebhook } from './webhookHandler';
import { handleValidateTicket, handleResendTicketEmail } from './callables';
import { growWebhookKeySecret, resendApiKeySecret } from './secrets';

export const growWebhook = onRequest({ secrets: [growWebhookKeySecret, resendApiKeySecret] }, async (req, res) => {
  const result = await handleGrowWebhook(req.body);
  res.status(result.status).json(result.body);
});

export const validateTicketCallable = onCall(async (request) => {
  return handleValidateTicket(request.data, request.auth ? { uid: request.auth.uid } : undefined);
});

export const resendTicketEmailCallable = onCall({ secrets: [resendApiKeySecret] }, async (request) => {
  return handleResendTicketEmail(request.data, request.auth ? { uid: request.auth.uid } : undefined);
});
