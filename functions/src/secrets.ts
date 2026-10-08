import { defineSecret } from 'firebase-functions/params';

export const growWebhookKeySecret = defineSecret('GROW_WEBHOOK_KEY');
export const resendApiKeySecret = defineSecret('RESEND_API_KEY');
