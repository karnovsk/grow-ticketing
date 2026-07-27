import { defineSecret } from 'firebase-functions/params';

export const growWebhookKeySecret = defineSecret('GROW_WEBHOOK_KEY');
export const gmailAppPasswordSecret = defineSecret('GMAIL_APP_PASSWORD');
