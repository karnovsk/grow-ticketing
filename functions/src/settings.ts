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
  qrAltText: string;
  itemSeparator: string;
  utcOffsetMinutes: number;
}

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  subject: 'Your pickup ticket',
  greeting: 'Hi {customerName}, thanks for your purchase!',
  qrInstructions: 'Show this QR code at pickup:',
  itemsLabel: 'Items',
  businessName: 'Your Business',
  logoUrl: null,
  primaryColor: '#3a3a3a',
  direction: 'ltr',
  currencySymbol: '$',
  totalLabel: 'Total',
  dateLabel: 'Date',
  confirmationCodeLabel: 'Confirmation code',
  qrAltText: 'Pickup QR code',
  itemSeparator: 'x',
  utcOffsetMinutes: 0,
};

const STRING_FIELDS: (keyof EmailSettings)[] = [
  'subject',
  'greeting',
  'qrInstructions',
  'itemsLabel',
  'businessName',
  'primaryColor',
  'direction',
  'currencySymbol',
  'totalLabel',
  'dateLabel',
  'confirmationCodeLabel',
  'qrAltText',
  'itemSeparator',
];

export async function getEmailSettings(): Promise<EmailSettings> {
  const doc = await db.collection('settings').doc('emailTemplate').get();
  if (!doc.exists) return DEFAULT_EMAIL_SETTINGS;

  const data = doc.data() as Record<string, unknown>;
  const merged: EmailSettings = { ...DEFAULT_EMAIL_SETTINGS };

  for (const key of STRING_FIELDS) {
    const value = data[key];
    if (typeof value === 'string' && value !== '') {
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }
  if (typeof data.logoUrl === 'string' && data.logoUrl !== '') {
    merged.logoUrl = data.logoUrl;
  }
  if (typeof data.utcOffsetMinutes === 'number' && Number.isFinite(data.utcOffsetMinutes)) {
    merged.utcOffsetMinutes = data.utcOffsetMinutes;
  }

  return merged;
}
