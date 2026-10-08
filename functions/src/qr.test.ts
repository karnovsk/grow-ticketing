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

describe('generateQrDataUri sizing', () => {
  function pngWidth(uri: string): number {
    // PNG IHDR: width is the big-endian uint32 at byte offset 16.
    return Buffer.from(uri.split(',')[1], 'base64').readUInt32BE(16);
  }

  test('bakes a 4-module quiet zone and an integer 16px module scale into the PNG', async () => {
    // A UUID ticket id encodes as a 29x29 QR; with a 4-module margin on each
    // side that's 37 modules, at 16px each.
    const uri = await generateQrDataUri('3f2b8c1e-9a4d-4e7f-b6a1-0c5d2e8f9a7b');
    expect(pngWidth(uri)).toBe(37 * 16);
  });
});
