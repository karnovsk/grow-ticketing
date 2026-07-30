// Prints a scannable QR code for a ticket ID, using the same `qrcode`
// encoding as the real production QR (see ../src/qr.ts) — so it's a faithful
// stand-in for a ticket QR without ever creating a ticket via the Grow
// webhook. Pair with a ticket document added by hand in the Firebase Console.
//
// Usage:
//   node scripts/print-test-qr.mjs <ticketId> [--png <outputPath>]

import QRCode from 'qrcode';

const [ticketId, ...rest] = process.argv.slice(2);

if (!ticketId) {
  console.error('Usage: node scripts/print-test-qr.mjs <ticketId> [--png <outputPath>]');
  process.exit(1);
}

const pngFlagIndex = rest.indexOf('--png');
const pngPath = pngFlagIndex !== -1 ? rest[pngFlagIndex + 1] : null;

console.log(`Ticket ID: ${ticketId}\n`);
console.log(await QRCode.toString(ticketId, { type: 'terminal' }));

if (pngPath) {
  await QRCode.toFile(pngPath, ticketId, { margin: 1, width: 300 });
  console.log(`PNG written to ${pngPath}`);
}
