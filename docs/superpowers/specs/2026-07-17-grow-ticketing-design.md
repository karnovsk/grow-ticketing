# Grow Ticketing System — Design Spec

**Date:** 2026-07-17
**Status:** Approved for planning

## Purpose

After a customer completes a purchase of a physical item via Grow (`https://developers.grow.business/`), automatically issue them a QR-code ticket by email. Staff at a single delivery/pickup location validate the ticket (via QR scan or manual search) before handing over the item, with a full audit trail of issued vs. validated tickets.

## Scope

- In scope: webhook-driven ticket issuance, email delivery, staff-facing QR validation web app, ticket list/audit dashboard.
- Explicitly deferred (not built now, but designed for): SMS delivery of the ticket, and a public token-gated hosted ticket page (needed to support SMS links, since SMS can't embed images). The data model already stores `customerPhone` so this can be added later without a migration.
- Multiple delivery locations: not needed — single location only.

## Constraints

- Simple and easily maintainable by a small/solo team.
- Use free-tier services wherever practical (true SMS delivery is the one piece that's never fully free — irrelevant for now since SMS is deferred).
- Secure: no forgeable/guessable tickets, no public exposure of customer PII, authenticated staff access only.
- Expected volume: 100–1,000 tickets/month.

## Architecture

**Platform: Firebase** (Cloud Functions, Firestore, Firebase Auth, Firebase Hosting) — chosen over a Supabase+Vercel split or a self-hosted VM because it keeps everything (backend logic, database, auth, hosting) on one platform with one free tier to track, minimizing ongoing maintenance for a single-location, moderate-volume system.

**Components:**

1. **Webhook receiver** (Cloud Function, HTTPS trigger) — Grow calls this on payment completion. Validates the request, extracts order/customer/product data, creates a ticket record.
2. **Firestore database** — one `tickets` collection, the single source of truth for ticket state.
3. **QR generator** — part of the webhook function: creates a unique, high-entropy, unguessable ticket ID and renders it as a QR code image.
4. **Notification sender** — part of the webhook function: sends one email (via a free-tier email provider, e.g. Resend or SendGrid) with the QR code embedded inline and a plain-text summary of purchased items.
5. **Staff validation web app** (Firebase Hosting, authenticated) — staff log in with individually-provisioned Firebase Auth accounts, scan a customer's QR using their own phone's camera in the browser (no app install), view the order's item list, and confirm pickup.
6. **Ticket dashboard** (same web app, authenticated) — lists all tickets with filters for issued vs. validated, serving as the audit trail.

## Data Flow

1. **Purchase → webhook fires.** Grow calls the webhook function with the payment payload (transaction code, `payerEmail`, `payerPhone` if available, product line items, payment sum, `webhookKey`).
2. **Ticket creation.** The function:
   - Checks whether a ticket already exists for this `transactionCode` (idempotency — see Error Handling); if so, returns success without creating a duplicate.
   - Generates a unique, non-sequential, high-entropy ticket ID.
   - Writes a Firestore document keyed by that ID (see Data Model).
   - Renders a QR code encoding the ticket ID (the QR carries no sensitive data — it's only a lookup key into Firestore).
3. **Notification.** The function sends one email to `customerEmail` with the QR image embedded inline and a plain-text item summary. Delivery outcome is recorded (`emailStatus`).
4. **Validation at pickup.** Staff opens the web app, scans the customer's QR (or manually searches by name/phone/transaction code if the QR is unavailable). If the ticket's `status` is `issued`, the app shows the item list for staff to confirm against the physical goods; staff taps "Confirm pickup," flipping `status` to `validated` and recording `validatedAt` and `validatedBy`.
5. **Re-scan protection.** Scanning an already-`validated` ticket shows an "already picked up" message with the original validation time and staff member, rather than allowing a second pickup.

## Data Model

Single Firestore collection: **`tickets`**. Document ID = the ticket's random token (also stored as a field).

| Field | Type | Notes |
|---|---|---|
| `ticketId` | string | Same as doc ID; random, unguessable, high-entropy |
| `status` | `"issued"` \| `"validated"` | |
| `transactionCode` | string | From Grow; used for idempotency and support lookups |
| `customerName` | string | From webhook payload |
| `customerEmail` | string | From webhook payload |
| `customerPhone` | string \| null | From webhook's `payerPhone`, when provided — stored now to support the deferred SMS feature later without a migration |
| `items` | array of `{ name, quantity }` | From Grow's product line-item data |
| `paymentSum` | number | For staff reference |
| `issuedAt` | timestamp | |
| `validatedAt` | timestamp \| null | |
| `validatedBy` | string \| null | Staff member's Firebase Auth UID |
| `emailStatus` | `"sent"` \| `"failed"` | So failed sends are visible and retryable from the dashboard, not silently lost |

No separate "staff" collection: staff accounts are individually provisioned in the Firebase Auth console (no public self-signup), so any authenticated user is staff by definition. Firestore security rules require `request.auth != null` for all reads/writes to `tickets`.

**Retention:** ticket records (including customer PII) are kept indefinitely — no scheduled deletion. This was a deliberate choice for support/audit purposes; revisit if data volume or privacy requirements change.

## Error Handling & Edge Cases

- **Duplicate webhook deliveries:** the function is idempotent on `transactionCode` — a retried webhook for the same transaction never creates a second ticket.
- **Malformed/incomplete payload:** if required fields (email, items) are missing, the function logs the error and returns a non-200 response so Grow's own retry logic gets a chance to redeliver, rather than silently creating a broken ticket.
- **Email delivery failure:** the ticket is still created even if the email fails; `emailStatus: "failed"` is recorded, and the staff dashboard exposes a "resend email" action.
- **Lost/inaccessible QR:** staff can search the dashboard by customer name, phone, or transaction code and validate manually, recording a required short note (e.g. "verified via ID/phone") for audit purposes.
- **QR not found:** scanning an unrecognized code shows a clear "ticket not found" message.
- **Already-validated ticket:** shows "already picked up" with the original validation time/staff member.
- **Staff connectivity:** the validation app requires a live connection to read/update Firestore; no offline mode is built (YAGNI at this scale/volume — revisit only if it becomes a real problem).

## Security

- **Webhook authenticity — open question to verify with Grow support before implementation.** Grow's webhook payloads include a `webhookKey` field (e.g. `"webhookKey":"ABC1234"` in their docs' example payloads), but Grow's documentation at `https://developers.grow.business/docs/webhooks` never explains what this field is for — it isn't documented as a shared secret, signature, or otherwise. Before implementation, confirm directly with Grow support (contacted anyway to enable webhooks, per their docs) what `webhookKey` represents and whether any request-authenticity mechanism exists (shared secret, signature header, IP allowlist). The webhook function must reject requests that fail whatever check is actually available; if none exists, this is a real gap to raise with Grow and mitigate as well as possible (e.g. treating the webhook URL itself as a hard-to-guess secret).
- **Transport:** Cloud Functions are HTTPS-only.
- **Ticket tokens:** unguessable, high-entropy, non-sequential — can't be enumerated or guessed. There is no public-facing endpoint other than the webhook receiver (the deferred public ticket page is not built now), minimizing attack surface.
- **Staff auth:** Firebase Auth, accounts individually provisioned (no public self-signup). Firestore security rules require `request.auth != null` for any access to `tickets`. The webhook function writes via the Admin SDK, which bypasses client-facing security rules — appropriate since it runs only server-side.
- **Secrets:** Grow's `webhookKey` (or whatever authenticity mechanism Grow confirms) and the email provider's API key are stored in Firebase Secret Manager / Functions config, never committed to source control.
- **PII handling:** ticket records containing customer name/email/phone are accessible only to authenticated staff, per the Firestore rules above.

## Testing

- **Webhook function:** unit tests with mocked Grow payloads (valid and malformed), verifying: correct ticket creation, no duplicate ticket on repeated `transactionCode`, rejection of requests failing the webhook-authenticity check, non-200 response on missing required fields.
- **Email sending:** mocked in automated tests; one manual end-to-end smoke test against Grow's sandbox/testing environment before launch, confirming a real email arrives with a working QR.
- **Validation app:** tests for ticket lookup by ID, the `issued → validated` transition, rejection of a second validation attempt, and the manual search/override fallback path.
- **Firestore security rules:** tested with the Firebase Rules emulator to confirm unauthenticated reads/writes are actually rejected.
- **Manual pre-launch check:** one real purchase through Grow's test/sandbox mode, followed by a real scan-and-validate pass at the delivery point using an actual staff account.

## Deferred Features (documented, not built now)

- **SMS delivery** of the ticket to `customerPhone`.
- **Public, token-gated hosted ticket page** (e.g. `/t/:ticketId`), needed to support SMS (which can't embed a QR image directly) — would be served by a dedicated Cloud Function returning only the safe-to-show fields (item list, freshly rendered QR), never raw Firestore access from the browser.
