# HttpOnly authentication session boundary

DealFlow authentication is server-owned. Signup, password login, Google OAuth
initiation, password recovery, password update, logout, MFA enrollment, and MFA
verification execute through DealFlow route handlers. The browser receives only
success state, safe redirects, and the one-time MFA enrollment QR required by
the user; it never receives Supabase access or refresh tokens.

Production Supabase session cookies are `HttpOnly`, `Secure`,
`SameSite=None`, host-only, and partitioned so ClickToScale's approved GHL
iframe can maintain an isolated session without making session material
available to JavaScript or another top-level site. Local development uses
`SameSite=Lax` without `Secure` or `Partitioned`.

Every mutating auth request is exact-origin checked, bounded, and durably rate
limited. Callback URLs must resolve to the same host's `/auth/callback` with the
exact expected PKCE flow. The callback exchanges the one-time code on the
server. MFA endpoints remain authenticated and are not public proxy paths.

The proxy remains the refresh boundary. It reads incoming HttpOnly cookies,
validates the user with Supabase, and writes refreshed HttpOnly cookies to the
response. UI navigation and all application API requests pass through that
boundary, so no browser-side token refresher is required.

Regression proof:

- `npm run test:auth-cookie-hardening`
- `npm run test:auth-pkce`
- `npm run test:mfa-user-journey`
- `npm run test:lead-tracking-health`
- `npm run smoke:offline`
