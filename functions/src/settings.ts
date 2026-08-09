import { db } from './admin';

export interface EmailSettings {
  subject: string;
  greeting: string;
  qrInstructions: string;
  itemsLabel: string;
  businessName: string;
  logoUrl: string | null;
  primaryColor: string;
  direction: 'rtl' | 'ltr';
  currencySymbol: string;
  totalLabel: string;
  dateLabel: string;
  confirmationCodeLabel: string;
}

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  subject: 'Your pickup ticket',
  greeting: 'Thanks for your purchase!',
  qrInstructions: 'Show this QR code at pickup:',
  itemsLabel: 'Items:',
  businessName: 'Your Business',
  logoUrl: null,
  primaryColor: '#3a3a3a',
  direction: 'ltr',
  currencySymbol: '$',
  totalLabel: 'Total',
  dateLabel: 'Date',
  confirmationCodeLabel: 'Confirmation code',
};

export async function getEmailSettings(): Promise<EmailSettings> {
  const doc = await db.collection('settings').doc('emailTemplate').get();
  if (!doc.exists) return DEFAULT_EMAIL_SETTINGS;
  return { ...DEFAULT_EMAIL_SETTINGS, ...(doc.data() as Partial<EmailSettings>) };
}
