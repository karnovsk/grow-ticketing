import { db } from './admin';

export interface EmailSettings {
  subject: string;
  preheader: string;
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
  utcOffsetMinutes: number;
  sendingEnabled: boolean;
  redirectAllEmails: boolean;
  redirectAllEmailsTo: string;
}

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  subject: 'Your pickup ticket',
  preheader: 'Your ticket QR code is inside. Show it at pickup.',
  greeting: 'Hi {customerName}, thanks for your purchase!',
  qrInstructions: 'Show this QR code at pickup',
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
  utcOffsetMinutes: 0,
  sendingEnabled: true,
  redirectAllEmails: false,
  redirectAllEmailsTo: '',
};

const STRING_FIELDS: (keyof EmailSettings)[] = [
  'subject',
  'preheader',
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
  'redirectAllEmailsTo',
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
  if (typeof data.sendingEnabled === 'boolean') {
    merged.sendingEnabled = data.sendingEnabled;
  }
  if (typeof data.redirectAllEmails === 'boolean') {
    merged.redirectAllEmails = data.redirectAllEmails;
  }

  return merged;
}

export interface ArchiveSettings {
  enabled: boolean;
  dryRun: boolean;
  pickedUpAfterDays: number;
  unclaimedAfterDays: number;
}

const DEFAULT_ARCHIVE_SETTINGS: ArchiveSettings = {
  enabled: true,
  dryRun: false,
  pickedUpAfterDays: 50,
  unclaimedAfterDays: 365,
};

// Read by the nightly archive run (see archiveService.ts). A day count has to
// be a positive number to be accepted — a 0 or negative value in the document
// would archive tickets the moment they're sold or picked up, so it falls
// back to the default instead.
export async function getArchiveSettings(): Promise<ArchiveSettings> {
  const doc = await db.collection('settings').doc('archive').get();
  if (!doc.exists) return DEFAULT_ARCHIVE_SETTINGS;

  const data = doc.data() as Record<string, unknown>;
  const merged: ArchiveSettings = { ...DEFAULT_ARCHIVE_SETTINGS };
  if (typeof data.enabled === 'boolean') merged.enabled = data.enabled;
  if (typeof data.dryRun === 'boolean') merged.dryRun = data.dryRun;
  for (const key of ['pickedUpAfterDays', 'unclaimedAfterDays'] as const) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) merged[key] = value;
  }
  return merged;
}
