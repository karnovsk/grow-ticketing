# Ticket Confirmation Email Redesign — Design Spec

**Date:** 2026-08-09
**Status:** Approved for planning

## Purpose

The buyer-facing ticket confirmation/pickup email (`functions/src/email.ts`, `buildTicketEmailHtml()`) is currently a single unstyled HTML string: a greeting, the QR code, and a bare item list — no styling, no branding, no price/date/confirmation info. This spec redesigns it to be visually attractive and brandable per deployment, while keeping `functions/src` generic (no hardcoded brand, color, or language).

## Scope

- In scope: `functions/src/email.ts` (`buildTicketEmailHtml`), `functions/src/settings.ts` (`EmailSettings`, `DEFAULT_EMAIL_SETTINGS`), associated tests.
- Explicitly out of scope: the email *sending* mechanism (`sendViaGmail`/`sendViaResend`, provider selection, CID attachment plumbing for the QR) — unchanged. No admin UI for editing settings — this deployment's `settings/emailTemplate` doc is still edited directly (Firestore console or a script), same as today. No multi-tenant data model — see Tenancy below.

## Tenancy Model

This repo is single-tenant per deployment: one Firebase project = one client (confirmed — `habaronit-qr` is the only project, and `Ticket`/settings have no `clientId`/`tenantId` field anywhere). "Generic repo, customizable email" means each client's *own* deployment configures its *own* branding — not one deployment serving multiple brands. No tenant concept is added to the data model.

## Data Model — `EmailSettings`

Extends the existing `settings/emailTemplate` Firestore doc (`functions/src/settings.ts`), following the pattern already used for `greeting`/`qrInstructions`/`itemsLabel`:

```ts
interface EmailSettings {
  // existing
  subject: string;
  greeting: string;
  qrInstructions: string;
  itemsLabel: string;
  // new
  businessName: string;
  logoUrl: string | null;
  primaryColor: string;          // hex; drives the hero band
  direction: 'rtl' | 'ltr';
  currencySymbol: string;
  totalLabel: string;
  dateLabel: string;
  confirmationCodeLabel: string;
}
```

`DEFAULT_EMAIL_SETTINGS` gains generic, brand-free defaults for every new field (`businessName: 'Your Business'`, `logoUrl: null`, `primaryColor: '#3a3a3a'`, `direction: 'ltr'`, `currencySymbol: '$'`, English labels), merged the same way existing defaults are today. A fresh deployment with an empty settings doc renders a neutral email with no assumed brand, language, or currency. `habaronit-qr`'s doc is updated separately (not part of this code change) with Hebrew values, `direction: 'rtl'`, their logo URL and color.

## Template Structure

`buildTicketEmailHtml()` stays a plain TypeScript function returning an HTML string — no templating engine added, consistent with the repo's zero-dependency style — but is restructured as **table-based HTML email** (inline styles; tables instead of flexbox/grid, since Outlook's rendering engine doesn't support modern CSS layout). Sections, top to bottom:

1. **Hero band** — background `primaryColor`, full-width within a standard centered 600px email table on a plain white body background (no new "page background" setting — white is the fixed body color, consistent with the current email having no body styling at all). Contains `logoUrl` image (omitted entirely, not broken, when `logoUrl` is `null`) and `businessName`, then the existing greeting (`Hi {customerName}, {settings.greeting}`). Bottom corners get a **punch-hole notch** detail — two small circles filled with white (matching the body background) positioned via inline CSS — wrapped in `<!--[if !mso]><!-->…<!--<![endif]-->` MSO conditional comments — Outlook desktop skips the notch markup entirely and simply renders a plain rectangular band; every other client (Gmail, Apple Mail, mobile, Outlook.com web) gets the notch.
2. **QR section** — unchanged mechanism (still `<img src="cid:ticket-qr">`, still a CID attachment via `qrDataUriToBuffer`/`QR_IMAGE_CID` in `email.ts` — no change to how the QR is generated or attached), restyled and centered, with `qrInstructions` beneath it.
3. **Receipt section** — item list (`{quantity} × {name}` per `TicketItem`, unchanged data), a total row (`totalLabel`: `currencySymbol` + `paymentSum.toFixed(2)`), and a muted line with `confirmationCodeLabel: transactionCode` and `dateLabel: issuedAt` formatted as `DD.MM.YYYY`.

The whole document sets `dir` from `settings.direction`; text alignment follows it throughout. Typography is a single web-safe stack (`Arial, Helvetica, sans-serif`) everywhere — the only realistic choice with full Hebrew glyph coverage across Outlook/Gmail/Apple Mail without relying on external fonts, which many clients strip. Visual hierarchy comes from size/weight, not font-switching.

## Formatting Decisions

- **Currency**: `currencySymbol` (setting) + `paymentSum.toFixed(2)`, no locale-specific `Intl` formatting — avoids hardcoding a locale/currency assumption into a generic template; alignment (symbol before/after the number) follows `direction` via CSS.
- **Date**: fixed `DD.MM.YYYY` — unambiguous, no locale-specific month names needed, sidesteps another hardcoding decision.

## Error Handling & Edge Cases

- `logoUrl: null` → hero band renders with just `businessName`, centered, no broken-image icon.
- `logoUrl` set but unreachable at render time in the recipient's client → standard `<img alt="{businessName}">` fallback; no server-side URL validation or fetch-and-check added.
- Missing/empty `businessName` or `primaryColor` in a malformed settings doc → falls through to `DEFAULT_EMAIL_SETTINGS` values (existing merge behavior), never a blank hero band.
- All settings-sourced and ticket-sourced text (`businessName`, `greeting`, item names, `customerName`, etc.) continues through the existing `escapeHtml()` helper — new fields get the same treatment as current ones.
- Long item lists: no truncation, same as today — not a new concern introduced by this redesign.

## Compatibility

Outlook desktop fallback is handled via MSO conditional comments around the one shaped-CSS detail (the punch-hole notch); everything else (tables, inline styles, web-safe fonts) is standard email-safe HTML requiring no other client-specific branching. No visual regression/screenshot tooling exists in this repo today and none is added — manual verification via a real send (existing `resendTicketEmailCallable` / `print-test-qr` pattern) is the verification method, same as prior email changes.

## Testing

Extends the existing Jest tests around `email.ts`:

- Default settings (no branding fields set) render a neutral email — no logo, generic color, English/LTR.
- Custom settings render logo, color, and all label text correctly.
- `direction: 'rtl'` vs `'ltr'` sets the `dir` attribute and alignment correctly.
- New fields (`businessName`, labels, etc.) are HTML-escaped.
- `logoUrl: null` omits the `<img>` tag entirely rather than rendering a broken image.
