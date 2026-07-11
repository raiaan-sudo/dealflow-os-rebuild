# Meta contract hardening evidence

## Scope and baseline

- Canonical source baseline: `d37c50945ff7004d700301fc89c15eb9273dac5b`.
- Scope: Meta OAuth, Graph discovery/read calls, launch writes, status sync, and Conversions API requests owned by this implementation wave.
- Safety posture: no Meta, Facebook, customer, or production request was executed while implementing or testing this change.

## Contract decision

DealFlow now has one Meta platform contract in `src/lib/integrations/meta/contract.ts`:

- Graph API version: `v23.0`.
- Graph origin: `https://graph.facebook.com`.
- OAuth origin: `https://www.facebook.com`.
- Live-write flag: `ALLOW_META_LIVE_LAUNCH`, enabled only by the exact string `true`.

`v23.0` was already present in the canonical repository's Meta Conversions API path, so it is the only repository-proven version at this baseline. The prior implementation mixed `v18.0`, `v19.0`, and `v23.0`. A live provider handshake was deliberately not performed, so current external acceptance of every endpoint and permission combination remains not proven in this offline wave.

## Credential and request guarantees

- Graph URLs are built only by `buildMetaGraphUrl` and reject `access_token`, `fb_exchange_token`, `client_secret`, and authorization `code` query parameters.
- Authenticated Graph calls send access tokens in `Authorization: Bearer ...` headers.
- OAuth code and long-lived-token exchanges use form-encoded `POST` bodies. App secrets, authorization codes, and exchange tokens are not placed in URLs.
- The common Meta request wrapper rejects credential-bearing URLs before calling `fetch`.
- OAuth return paths are restricted to the configured application origin; absolute and protocol-relative external redirects fall back to `/launch`.
- Existing Meta error/retry logging receives request purpose, status, and request IDs, but never request URLs, auth headers, or token-exchange bodies.

## Default-off write posture

- `META_EXECUTION_MODE` still defaults to `sandbox` in the existing environment contract.
- The common request wrapper rejects `launch_create` and `conversion` POST requests before `fetch` unless the explicit live-write flag is open.
- Live campaign, ad set, creative, ad, and provider-status writes now guard themselves before provider I/O and require `ALLOW_META_LIVE_LAUNCH=true`.
- Meta Conversions API sends now use the same explicit live-write gate. When the flag is absent or not exactly `true`, the conversion is recorded as skipped with reason `meta_live_write_disabled`; no provider request is made.
- Read-only OAuth discovery, selection validation, and status sync remain available when their existing authentication and authorization requirements are satisfied.

## Deterministic verification

Executed with Node `v20.20.2` unless noted:

1. `/Users/raiaanreza/.nvm/versions/node/v20.20.2/bin/node scripts/test-meta-contract-hardening.mjs` — passed.
   - Compiles and executes the actual TypeScript contract in-memory.
   - Proves `v23.0` URL consistency.
   - Proves credentials cannot be added to URLs.
   - Proves Bearer-header and form-body credential transport.
   - Proves same-origin return paths are allowed and external redirects are rejected.
   - Proves live writes are closed by default and only the exact opt-in opens the gate.
   - Executes the common request wrapper with an in-memory fake transport and proves launch/conversion writes stop before transport while read-only discovery remains available.
   - Statically rejects version literals, credential query strings, endpoint-builder bypasses, and direct `fetch` callers outside the single request wrapper.
   - Performs no network request.
2. `node scripts/test-meta-contract-hardening.mjs` with Node `v24.14.1` (production-major parity) — passed with the same offline result.
3. Targeted ESLint for the owned Meta sources and test — passed with no output.
4. `./node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json` — passed with no output.
5. `git diff --check` — passed with no output.

## External proof blocker

The following remain intentionally unproven because proving them would require a signed-in Meta account and/or provider calls outside this offline-safe implementation wave:

- OAuth dialog and callback completion against a real Meta app configured for Graph API `v23.0`.
- Token exchange, ad-account/Page/pixel discovery, and permission compatibility for the production Meta app.
- Real status/insight reads and Conversions API acceptance.
- Any campaign/ad object creation, update, activation, spend, or delivery behavior.

These are provider-environment verification blockers, not simulated passes. No reconnect, launch, conversion, customer record, provider write, spend, or external mutation was attempted.
