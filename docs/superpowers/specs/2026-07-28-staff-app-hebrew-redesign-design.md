# Staff App Hebrew Translation & UI Redesign — Design Spec

**Date:** 2026-07-28
**Status:** Approved for planning

## Purpose

The staff validation web app (`web/`) is functionally complete but was built with zero styling and English-only text (see [`2026-07-17-grow-ticketing-design.md`](2026-07-17-grow-ticketing-design.md) and `TODO.md` item 2). This spec covers two changes to that app:

1. Translate the entire UI to Hebrew (default), with a toggle back to English, including RTL layout.
2. Streamline the QR scanning flow so staff explicitly confirm a pickup instead of the ticket being silently validated the instant a QR code is decoded.

Both ship together with a visual design pass, since the redesigned scan flow needs real layout/feedback states to be usable one-handed at a counter.

## Scope

- In scope: `web/` only — `main.ts` (login/nav/header), `scanView.ts`, `searchView.ts`, `dashboardView.ts`, `format.ts`, plus new `i18n.ts` and `style.css`.
- Explicitly out of scope: any change to `functions/` (webhook handling, email sending, `validateTicketCallable`, `resendTicketEmailCallable` all stay as-is), Firestore data model, Firestore security rules, and the deferred SMS/public-ticket-page features from the original spec.
- Google sign-in and password reset (TODO items 3–4) are not part of this change.

## Current State (why this is needed)

- `web/` has no CSS anywhere — plain unstyled HTML, hardcoded English strings, a fixed 300px-wide camera view.
- `scanView.ts` calls `validateTicketCallable` directly inside the QR decode callback — the ticket's status flips to `validated` the instant a code is read, with no preview or confirmation step. This contradicts the original design spec's stated flow ("staff taps 'Confirm pickup'") and means a mis-scanned or wrong-customer QR is committed with no undo.
- There is no read-only "peek" endpoint — `validateTicketCallable` both looks up and commits in one call.

## Language & RTL System

New `web/src/i18n.ts`:

- `type Lang = 'he' | 'en'`.
- `translations: Record<Lang, Record<TranslationKey, string>>` — a flat dictionary per language, one key per UI string across all views.
- `getLang()` / `setLang(lang)` — read/write the active language to `localStorage` (key `lang`); default `'he'` when unset.
- `t(key: TranslationKey): string` — returns the string for the active language.
- `applyDir()` — sets `document.documentElement.lang` and `document.documentElement.dir` (`rtl` for `he`, `ltr` for `en`); called on load and whenever the language changes.

A toggle control in the app header (e.g. "עב" / "EN") calls `setLang`, then `applyDir()`, then re-renders the header and the current route (reusing `main.ts`'s existing `renderRoute`). Toggling language never restarts the camera stream if the scan view is active — only text and `dir` change in place.

CSS uses logical properties (`margin-inline-start`, `padding-inline-end`, `text-align: start`, etc.) rather than physical `left`/`right`, so layout mirrors automatically under `dir="rtl"`. The only anticipated exception is the camera viewfinder's corner-bracket decoration, which gets an explicit `[dir="rtl"]` override.

`format.ts`'s `formatTimestamp` takes the active BCP-47 locale tag (`he-IL` / `en-US`) so dates render in the correct convention per language. Data pulled from Firestore — customer names, item names — is never translated; it's merchant-entered content and stays as-is regardless of UI language.

## Scan Flow Redesign

Replaces the current single-step "decode = commit" behavior with an explicit four-state flow in `scanView.ts`:

1. **Scanning** — live camera feed, viewfinder frame, instruction text ("Point camera at ticket QR"). Camera view is responsive (`min(90vw, 400px)` square) instead of the current hardcoded 300px.
2. **Preview** (on successful decode) — the camera pauses (not stopped) and a client-side `getDoc(doc(db, 'tickets', decodedText))` read (same direct-Firestore-read pattern `searchView.ts`/`dashboardView.ts` already use — no new Cloud Function needed) populates a result card. The card branches on what's found:
   - **`issued`** — neutral card showing customer name and item list, a primary **"Confirm pickup"** button, and a secondary **"Scan again"** button.
   - **already `validated`** — amber card: "Already picked up," original `validatedAt`/`validatedBy`, only a "Scan again" button (no confirm).
   - **not found** — red card: "Ticket not found," a "Scan again" button, and a link into the Search view for manual lookup.
3. **Committing** — on tapping "Confirm pickup," the button disables immediately and shows a spinner while `validateTicketCallable` runs (existing callable, unchanged), guarding against double-taps.
4. **Result** — on success, a green "Picked up" card with the item list. If another staff member validated the same ticket in the interval between preview and confirm (race condition), `validateTicketCallable` returns `already_validated` — shown as the same amber "already picked up" card from step 2, not a generic error. The result view auto-returns to Scanning after ~3 seconds, or staff can tap "Scan next" immediately to skip the wait.

This turns one implicit tap (scan = commit) into two explicit taps (scan, then confirm) — the deliberate trade-off for removing the risk of an accidental scan silently consuming a ticket with no undo.

## Search & Dashboard Changes

- All strings translated via `t()`; no functional changes to the search/filter logic itself.
- Bare `<li>` rows in both views become styled cards; ticket status is shown as a small colored pill (`issued` = blue, `validated` = green) instead of a plain-text suffix.
- Search view gains Enter-key submission (currently button-click only).
- Dashboard's filter dropdown and "Resend email" button are restyled; behavior unchanged.
- Login form gets translated labels/placeholders/error text, styled to match the rest of the app.

## Visual Design System

New `web/src/style.css`, imported once from `main.ts`. Plain CSS, no new dependencies (no CSS framework, no component library, no webfonts — the system font stack keeps things fast on potentially weak counter wifi), consistent with the project's existing zero-dependency approach:

- A small set of CSS custom properties: background, surface, text, primary (action blue), success (green), warning (amber), error (red) — roughly 6–7 color tokens — plus a simple type scale.
- Mobile-first layout: single column, minimum 44px tap targets, primary actions bottom-anchored on the scan view for one-handed thumb reach at a counter.
- A `@media (min-width: 720px)` breakpoint gives Search and Dashboard a roomier layout (e.g., side-by-side filter controls) when opened on a desktop/laptop.

## Error Handling & Edge Cases

- Camera permission denied / no camera available: existing message, now translated.
- `getDoc` failure during the preview step (e.g., a connectivity blip): show "Couldn't check this ticket, try again" with a retry action — never falls through to auto-confirm.
- Double-tap on "Confirm pickup": button disables on first click, only re-enabled if the callable errors.
- Race condition (two staff scan the same ticket concurrently): handled as described in the Result state above — shown as "already picked up," not an error.
- Language toggle while a scan result/preview is on screen: re-renders text and `dir` in place without touching the camera stream or resetting the current state.

## Testing

- Extend `format.test.ts` to cover per-language timestamp formatting (`he-IL` vs `en-US`).
- New `i18n.test.ts`: verifies every `TranslationKey` has an entry in both `he` and `en` dictionaries (no missing-translation gaps).
- New tests for `scanView.ts`'s state transitions — currently untested: `issued` → preview → confirm → result; `validated` → preview → "already picked up"; not-found path; the race-condition path where confirm returns `already_validated`.
- Manual pre-launch check: real device, one-handed, both languages, confirming RTL mirrors correctly and the scan → preview → confirm flow feels comfortable at a counter.
