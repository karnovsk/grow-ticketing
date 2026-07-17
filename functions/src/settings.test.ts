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
});
