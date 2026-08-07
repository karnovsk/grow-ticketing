// Simulates a Grow payment notification by POSTing directly to the
// growWebhook function, with the same JSON shape Grow sends (see
// ../src/webhookHandler.ts's parsePayload and ../src/webhookHandler.test.ts's
// validPayload). This exercises the real ticket-creation -> QR -> email path
// without ever going through Grow's actual checkout, so no real Grow-side
// notifications fire.
//
// Requires a running `firebase emulators:start` (functions + firestore), and
// a functions/.secret.local file defining GROW_WEBHOOK_KEY to whatever value
// you pass as --key here (the emulator loads .secret.local for defineSecret()
// values). Without a matching GMAIL_APP_PASSWORD in .secret.local too, ticket
// creation still succeeds but the email send step will fail — check the
// emulator logs and the ticket's emailStatus field.
//
// Usage:
//   node scripts/fire-test-webhook.mjs <payerEmail> [options]
//
// Options:
//   --key <webhookKey>       must match GROW_WEBHOOK_KEY in .secret.local (default: local-test-key)
//   --url <url>              webhook URL (default: http://127.0.0.1:5001/habaronit-qr/us-central1/growWebhook)
//   --tx <transactionCode>   default: TEST-<timestamp>, so repeat runs create new tickets
//   --name <payerFullName>   default: Test Customer
//   --phone <payerPhone>     default: 0500000000
//   --sum <paymentSum>       default: 100
//   --items "Name:qty,Name:qty"  default: Test Item:1

const DEFAULT_URL = 'http://127.0.0.1:5001/habaronit-qr/us-central1/growWebhook';

const [payerEmail, ...rest] = process.argv.slice(2);

if (!payerEmail) {
  console.error('Usage: node scripts/fire-test-webhook.mjs <payerEmail> [--key <key>] [--url <url>] [--tx <transactionCode>] [--name <name>] [--phone <phone>] [--sum <n>] [--items "Name:qty,Name:qty"]');
  process.exit(1);
}

function flag(name, fallback) {
  const index = rest.indexOf(`--${name}`);
  return index !== -1 ? rest[index + 1] : fallback;
}

function parseItems(raw) {
  return raw.split(',').map((entry) => {
    const [name, qty] = entry.split(':');
    return { name: name.trim(), quantity: Number(qty ?? 1) };
  });
}

const payload = {
  webhookKey: flag('key', 'local-test-key'),
  transactionCode: flag('tx', `TEST-${Date.now()}`),
  paymentSum: Number(flag('sum', '100')),
  payerFullName: flag('name', 'Test Customer'),
  payerEmail,
  payerPhone: flag('phone', '0500000000'),
  productData: parseItems(flag('items', 'Test Item:1')),
};

const url = flag('url', DEFAULT_URL);

console.log(`POST ${url}`);
console.log(JSON.stringify(payload, null, 2));

const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const body = await response.json().catch(() => ({}));
console.log(`\n${response.status} ${response.statusText}`);
console.log(JSON.stringify(body, null, 2));

if (body.ticketId) {
  console.log(`\nTicket ID: ${body.ticketId}`);
  console.log(`Print its QR with: npm run print-test-qr -- ${body.ticketId}`);
}
