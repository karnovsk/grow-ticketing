# Grow Ticketing System

Issues an emailed QR-code pickup ticket when a Grow purchase webhook fires, and lets staff validate tickets at the delivery point. See `docs/superpowers/specs/2026-07-17-grow-ticketing-design.md` for the full design.

## Setup and workflow

### 1. Create and select the Firebase project

1. Create a Firebase project in the [Firebase console](https://console.firebase.google.com/).
2. Enable, in that project: **Firestore Database** (production mode), **Authentication** (Email/Password provider), **Hosting**, and **Functions**.
3. Upgrade to the **Blaze (pay-as-you-go) plan** — Cloud Functions on the free Spark plan cannot make outbound network calls (needed to reach Gmail's SMTP servers or Resend's API), and Secret Manager (used for secrets below) also requires Blaze. If you skip this, `firebase functions:secrets:set` fails with an explicit error telling you to upgrade, linking straight to the upgrade page. Blaze still has a generous free tier; at the volume this project is designed for (100–1,000 tickets/month), you'll likely stay near $0.
4. Install project dependencies, which is also where the local Firebase CLI comes from — this repo does not require a global `firebase-tools` install:
   ```bash
   npm --prefix functions install
   npm --prefix web install
   ```
5. Log in to the Firebase CLI. This opens an interactive browser flow, so it must be run from a real terminal (not through a non-interactive script/agent):
   ```bash
   ./functions/node_modules/.bin/firebase login
   ```
6. Point the repo at your project. Copy `.firebaserc.example` to `.firebaserc` (gitignored — it's meant to hold your real project ID locally, not get committed), then run:
   ```bash
   ./functions/node_modules/.bin/firebase use <your-project-id> --alias default
   ```
   (`firebase use --add` also works, but it's an interactive picker — use the explicit form above if running from a script or non-interactive shell.)

   **If you have more than one Firebase project on the account**, double-check `.firebaserc` afterward and re-verify with `firebase use` (no arguments, prints the active project) — it's easy to grab a web app config from the wrong project later (step 8) if similarly-named projects exist, and the app will silently point at the wrong Firestore/Auth instance with no obvious error.

### 2. Set up an email provider

Pick one:

- **Gmail (default, no domain required)** — use an existing Gmail or Google Workspace account. Enable 2-Step Verification on it, then create an [App Password](https://myaccount.google.com/apppasswords) (Google Account → Security → 2-Step Verification → App passwords). Gmail's free sending cap is 500/day, well above this project's expected volume.
- **Resend (upgrade path, needs a domain)** — create a [Resend](https://resend.com) account, add and verify a sending domain (DNS records), and create an API key. Use this once you have a domain and want a dedicated sending address instead of a Gmail account. Note: this path is currently dormant in the code — see the "Switching email providers" note at the end of this section.

### 3. Contact Grow support

Per `https://developers.grow.business/docs/webhooks`, ask Grow support to enable webhooks for your account. You won't have the actual webhook URL to give them until after your first deploy (step 6) — it's fine to come back to this after deploying.

**Ask them directly what the `webhookKey` field in their webhook payloads represents and whether any other request-authenticity mechanism exists** (signature header, IP allowlist) — this project's webhook check assumes `webhookKey` is a static shared secret, which Grow's docs do not explicitly confirm.

### 4. Set the required secrets

`GROW_WEBHOOK_KEY` is always needed (pick your own random string — this is what you'll tell Grow to send back as `webhookKey`). Set `GMAIL_APP_PASSWORD` or `RESEND_API_KEY` depending on which provider you picked in step 2. Requires the Blaze upgrade from step 1.

```bash
./functions/node_modules/.bin/firebase functions:secrets:set GROW_WEBHOOK_KEY
./functions/node_modules/.bin/firebase functions:secrets:set GMAIL_APP_PASSWORD
```

Each command prompts you to type/paste the value on a separate line — **run these directly in your own interactive terminal**, not piped through a script or agent, and never pass the value as a command-line argument. Both leave the secret exposed in shell history or logs, and the command doesn't accept it as an argument anyway (it'll error with "Secret Payload cannot be empty").

Alternative: these secrets live in Google Cloud Secret Manager under the hood, so you can also create/update them via **[console.cloud.google.com/security/secret-manager](https://console.cloud.google.com/security/secret-manager)** (select your project, Create Secret, name it exactly `GROW_WEBHOOK_KEY` or `GMAIL_APP_PASSWORD`) if you prefer a UI over the CLI prompt.

### 5. Create staff accounts

Firebase console → **Authentication → Users → Add user** (email + password). Repeat per staff member — there is no public self-signup by design.

### 6. Configure and deploy the backend

Copy `functions/.env.example` to `functions/.env` and set `EMAIL_PROVIDER` plus the fields for whichever provider you're using:
- Gmail: `EMAIL_PROVIDER=gmail` and `GMAIL_USER=<the Gmail address the App Password belongs to>`.
- Resend: `EMAIL_PROVIDER=resend` and `TICKET_EMAIL_FROM=<your verified sender address>`.

**This is required** — `sendTicketEmail` throws if the active provider's config is unset or empty (deliberately: an unconfigured sender would otherwise fail silently), so ticket-issuing webhook calls will fail loudly until this is set. Functions v2 loads `.env` automatically, both for `firebase emulators:start` and at deploy time — no redeploy-specific step needed beyond having the file present.

Deploy just the backend for now — the frontend isn't configured yet (step 7), and `firebase.json`'s `predeploy` hook builds `web/` with whatever `web/.env` exists at deploy time, so deploying Hosting before step 7 would ship a build with no Firebase config baked in:

```bash
./functions/node_modules/.bin/firebase deploy --only functions,firestore:rules,firestore:indexes
```

Come back to step 3 with the resulting webhook URL.

### 7. Register a Firebase web app, configure, and deploy the frontend

1. Firebase console → **Project settings** (gear icon) → **General** tab → scroll to **Your apps**.
2. Click the `</>` (web) icon to register a new web app. Give it any nickname; you don't need to set up Hosting in that wizard (it's already configured via `firebase.json`).
3. Copy the `firebaseConfig` object it shows you (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
4. Copy `web/.env.example` to `web/.env` and fill in the six `VITE_FIREBASE_*` values from that config. **Double-check `VITE_FIREBASE_PROJECT_ID` matches your actual project ID exactly** — see the warning in step 1 about similarly-named projects.
5. Run the app locally and confirm it works before deploying (see step 8 for the command). Log in with a staff account from step 5 and confirm you land in the app (scan/search/dashboard nav) rather than an error or blank screen.
6. Deploy the frontend now that `web/.env` is in place:
   ```bash
   ./functions/node_modules/.bin/firebase deploy --only hosting
   ```
   From here on, use the combined command in step 9 for any future changes to functions and/or the web app together.

### 8. Local development workflow

Day-to-day commands for working on the codebase, once the one-time setup above is done:

- **Run the automated test suite**: `npm --prefix functions run test:emulator` (Jest against the Firestore emulator; doesn't touch your real Firebase project or require any setup beyond step 1.4).
- **Run the web app against your live Firebase project**: `npm --prefix web run dev` (same command used to verify in step 7.5).
- **Run the full stack locally against the emulators only** (Functions, Firestore, Auth, and Hosting, without touching the live project):
  ```bash
  npm --prefix functions run build && npm --prefix web run build && ./functions/node_modules/.bin/firebase emulators:start
  ```
  Unlike `firebase deploy`, `emulators:start` does not run the `predeploy` build hooks automatically, so build both first.

### 9. Deploying updates

For any future change to functions and/or the web app together:

```bash
./functions/node_modules/.bin/firebase deploy --only functions,firestore:rules,firestore:indexes,hosting
```

`firebase.json` runs `npm --prefix functions run build` and `npm --prefix web run build` automatically as `predeploy` hooks for their respective targets — you don't need to build either manually first, just make sure `npm install` has been run in both `functions/` and `web/` at least once (step 1.4).

You can also deploy targets individually, e.g. `--only firestore` (shorthand for `firestore:rules,firestore:indexes` together) or `--only hosting`. Note that `--only firestore` **does not touch the hosted web app** — if the live site looks stale or blank after a Firestore-only deploy, that's expected; redeploy `hosting` separately. A successful hosting deploy prints its own URL, which for this project is `https://habaronit-qr.web.app` (also aliased at `https://habaronit-qr.firebaseapp.com`).

### Switching email providers

Only one provider's secret is wired up at a time. Right now `functions/src/secrets.ts` only declares `GROW_WEBHOOK_KEY` and `GMAIL_APP_PASSWORD` — the `RESEND_API_KEY` declaration was deliberately removed because Firebase's deploy step prompts for a value for *every* `defineSecret()` found in the built codebase, even ones no function actually uses; leaving an unused declaration in place blocks deploys with an empty-value prompt.

To switch to Resend later:
1. Add back `export const resendApiKeySecret = defineSecret('RESEND_API_KEY');` to `functions/src/secrets.ts`.
2. Bind it in `functions/src/index.ts`'s `secrets` arrays for `growWebhook` and `resendTicketEmailCallable` (in place of, or alongside, `gmailAppPasswordSecret`).
3. Set `functions/.env`'s `EMAIL_PROVIDER=resend` and `TICKET_EMAIL_FROM`.
4. Run `firebase functions:secrets:set RESEND_API_KEY` and redeploy.

## Customizing the ticket email's wording and branding

The confirmation email's copy, branding, and layout details are all read from the `settings/emailTemplate` document in Firestore, not hardcoded — this keeps the repo generic across deployments. To customize them, open Firebase console → Firestore → create (or edit) a document at `settings/emailTemplate` with any of these fields (see `functions/src/settings.ts` for the full defaults):

**Text (string fields):**
- `subject` — email subject line
- `greeting` — the opening line under the business name; include the literal token `{customerName}` anywhere in the text to have it replaced with the buyer's name (e.g. `"Hi {customerName}, thanks for your purchase!"`, or in Hebrew `"שלום {customerName}, ההזמנה שלך מוכנה לאיסוף!"`). The token is optional — omit it if you don't want the name shown.
- `qrInstructions` — text shown under the QR code
- `qrAltText` — alt text for the QR image (accessibility/fallback text, not usually visible)
- `itemsLabel`, `totalLabel`, `dateLabel`, `confirmationCodeLabel` — receipt section labels (the template appends `:` after each automatically, so don't include one in the value)
- `itemSeparator` — the text between quantity and item name in each line (default `"x"`, e.g. `"2 x Widget"`)
- `businessName` — shown in the hero band

**Branding:**
- `logoUrl` — a public `https://` URL to the business's logo image; omit or set to an empty string to show no logo
- `primaryColor` — a hex color (`#rgb`, `#rrggbb`, or `#rrggbbaa`) for the hero band background; invalid or missing values fall back to a neutral default rather than breaking the email
- `direction` — `"rtl"` or `"ltr"`; controls text direction and alignment throughout the email

**Other:**
- `currencySymbol` — prefix for the total amount (default `"$"`)
- `utcOffsetMinutes` — the business's local UTC offset in minutes (e.g. `180` for Israel Daylight Time, UTC+3), used only to compute the correct local calendar date shown on the receipt

Any field left out keeps its built-in default. No redeploy is needed — changes take effect on the next email sent. Note: `primaryColor` is rendered as white text over the hero band, so avoid very light colors (no automatic contrast adjustment).

## One-off Firestore reads/writes from a local script

A standalone Node script using `firebase-admin` (e.g. `admin.initializeApp({projectId: ...})`) needs Application Default Credentials (ADC) to authenticate, separate from the Firebase CLI's own login. If `gcloud auth application-default login` hasn't been run on your machine, such a script fails with "Could not load the default credentials" even though `firebase deploy` and other CLI commands work fine (they use a different, CLI-internal OAuth flow).

If you hit this and don't want to set up `gcloud`/ADC, the workaround is to reuse the CLI's working auth instead: write a temporary Cloud Function (`onRequest`, guarded by a shared-secret query param you choose), deploy just it (`firebase deploy --only functions:<name>`), `curl` it once to perform the read/write, then delete it (`firebase functions:delete <name> --force`) and remove the code/secret.

## Deferred features (see design spec)

- SMS delivery of the ticket.
- A public, token-gated hosted ticket page (needed to support SMS, since SMS can't embed a QR image directly).
