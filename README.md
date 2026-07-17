# Grow Ticketing System

Issues an emailed QR-code pickup ticket when a Grow purchase webhook fires, and lets staff validate tickets at the delivery point. See `docs/superpowers/specs/2026-07-17-grow-ticketing-design.md` for the full design.

## One-time setup

1. Create a Firebase project in the [Firebase console](https://console.firebase.google.com/), enabling Firestore, Authentication (Email/Password provider), Hosting, and Functions (Blaze plan required for outbound network calls from Cloud Functions, e.g. to Resend).
2. Run `firebase use --add` from the repo root and select the new project, replacing the placeholder in `.firebaserc`.
3. Create a [Resend](https://resend.com) account (or another transactional email provider) and get an API key; free tier covers this project's expected volume (100–1,000 emails/month). Verify a sending domain/address with your provider — Resend (and most providers) will reject sends from an unverified `from` address.
4. Contact Grow support (per `https://developers.grow.business/docs/webhooks`) to enable webhooks for your account and get your webhook URL registered. **Ask them directly what the `webhookKey` field in their webhook payloads represents and whether any other request-authenticity mechanism exists** (signature header, IP allowlist) — this project's webhook check assumes `webhookKey` is a static shared secret, which Grow's docs do not explicitly confirm.
5. Set the two required secrets:
   ```bash
   firebase functions:secrets:set GROW_WEBHOOK_KEY
   firebase functions:secrets:set RESEND_API_KEY
   ```
6. Create at least one staff account in Firebase console → Authentication → Users → Add user (email + password). Repeat per staff member — there is no public self-signup by design.
7. Copy `web/.env.example` to `web/.env` and fill in the values from Firebase console → Project settings → General → Your apps → Web app config.
8. Copy `functions/.env.example` to `functions/.env` and set `TICKET_EMAIL_FROM` to your verified sender address (e.g. `tickets@yourdomain.com`). **This is required** — `sendTicketEmail` throws if it's unset or empty (deliberately: an unverified placeholder sender would otherwise fail silently), so ticket-issuing webhook calls will fail loudly until this is set. Functions v2 loads `.env` automatically, both for `firebase emulators:start` and at deploy time — no redeploy-specific step needed beyond having the file present.

## Local development

- Functions: `npm --prefix functions install`, then `npm --prefix functions run test:emulator` to run the full test suite against the Firestore emulator.
- Web app: `npm --prefix web install`, then `npm --prefix web run dev`.
- Full stack locally: `npm --prefix functions run build && npm --prefix web run build && firebase emulators:start` (serves Functions, Firestore, Auth, and Hosting together). Unlike `firebase deploy`, `emulators:start` does not run the `predeploy` build hooks automatically, so build both first.

## Deploying

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes,hosting
```

`firebase.json` runs `npm --prefix functions run build` and `npm --prefix web run build` automatically as `predeploy` hooks for their respective targets — you don't need to build either manually first, just make sure `npm install` has been run in both `functions/` and `web/` at least once.

After deploying, give Grow support the deployed `growWebhook` URL (visible in the Firebase console under Functions, or in the CLI output after deploy) to complete their webhook configuration.

## Customizing the ticket email's wording

The email's subject, greeting, QR instructions, and items label are read from the `settings/emailTemplate` document in Firestore, not hardcoded. To customize them, open Firebase console → Firestore → create (or edit) a document at `settings/emailTemplate` with any of these string fields: `subject`, `greeting`, `qrInstructions`, `itemsLabel`. Any field left out keeps its built-in default (see `functions/src/settings.ts`). No redeploy is needed — changes take effect on the next email sent.

## Deferred features (see design spec)

- SMS delivery of the ticket.
- A public, token-gated hosted ticket page (needed to support SMS, since SMS can't embed a QR image directly).
