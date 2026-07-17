import { onRequest } from 'firebase-functions/v2/https';
import { handleGrowWebhook } from './webhookHandler';
import { growWebhookKeySecret, resendApiKeySecret } from './secrets';

export const growWebhook = onRequest({ secrets: [growWebhookKeySecret, resendApiKeySecret] }, async (req, res) => {
  const result = await handleGrowWebhook(req.body);
  res.status(result.status).json(result.body);
});
