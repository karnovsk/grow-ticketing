import { generateQrDataUri } from './qr';

describe('generateQrDataUri', () => {
  test('returns a base64 PNG data URI', async () => {
    const uri = await generateQrDataUri('abc-123');
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('encodes different ticket ids into different data', async () => {
    const a = await generateQrDataUri('ticket-a');
    const b = await generateQrDataUri('ticket-b');
    expect(a).not.toBe(b);
  });
});
