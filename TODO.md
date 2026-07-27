# TODO

Backlog of known follow-up work, not yet scheduled or planned in detail.

1. **Automated test suite for the deployed environment.** Current tests (`functions/`, `web/`) cover unit/integration logic against the Firestore emulator and mocked I/O — nothing yet checks the *deployed* system end-to-end. Add a suite that: confirms the deployed `growWebhook` endpoint is reachable and responds correctly to a simulated Grow payload (valid key, invalid key, missing fields, duplicate `transactionCode`); confirms `validateTicketCallable` and `resendTicketEmailCallable` behave correctly against a real (or staging) Firebase project; and can run on a schedule or in CI as a smoke test.
2. **Upgrade the Staff App UI to an acceptable visual/UX standard.** The current `web/` app is functionally complete (scan, search, dashboard) but was built with minimal styling. Needs a real design pass — layout, spacing, feedback states, mobile ergonomics for the scan view in particular (used one-handed at a counter).
3. **Google sign-in for staff.** Add Google as a second Firebase Auth provider alongside email/password, for staff who'd rather not manage a separate password.
4. **Password reset flow.** Staff currently have no self-service way to recover a forgotten password (accounts are provisioned manually in the Firebase console, per the no-self-signup design). Add a "forgot password" link using Firebase Auth's built-in reset-email flow.
