import { getEmailSettings } from './settings';
import { db } from './admin';
import { clearFirestoreEmulator } from './testHelpers';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-grow-ticketing';

describe('getEmailSettings', () => {
  afterEach(async () => {
    await clearFirestoreEmulator(PROJECT_ID);
  });

  test('returns defaults when no settings document exists', async () => {
    const settings = await getEmailSettings();
    expect(settings.subject).toBe('Your pickup ticket');
    expect(settings.greeting).toBe('Thanks for your purchase!');
  });

  test('overrides defaults with fields from the settings document', async () => {
    await db.collection('settings').doc('emailTemplate').set({ subject: 'Custom subject line' });
    const settings = await getEmailSettings();
    expect(settings.subject).toBe('Custom subject line');
    expect(settings.greeting).toBe('Thanks for your purchase!');
  });

  test('returns generic, brand-free defaults for the new branding fields', async () => {
    const settings = await getEmailSettings();
    expect(settings.businessName).toBe('Your Business');
    expect(settings.logoUrl).toBeNull();
    expect(settings.primaryColor).toBe('#3a3a3a');
    expect(settings.direction).toBe('ltr');
    expect(settings.currencySymbol).toBe('$');
    expect(settings.totalLabel).toBe('Total');
    expect(settings.dateLabel).toBe('Date');
    expect(settings.confirmationCodeLabel).toBe('Confirmation code');
  });

  test('overrides branding fields independently from other defaults', async () => {
    await db.collection('settings').doc('emailTemplate').set({
      businessName: 'Acme Bakery',
      primaryColor: '#1f6f5c',
      direction: 'rtl',
    });
    const settings = await getEmailSettings();
    expect(settings.businessName).toBe('Acme Bakery');
    expect(settings.primaryColor).toBe('#1f6f5c');
    expect(settings.direction).toBe('rtl');
    expect(settings.logoUrl).toBeNull();
    expect(settings.currencySymbol).toBe('$');
    expect(settings.subject).toBe('Your pickup ticket');
  });
});
