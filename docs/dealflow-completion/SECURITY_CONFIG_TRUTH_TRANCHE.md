# Security and configuration truth tranche

> **Candidate security context; release status superseded.** Preserve the
> controls below as predecessor evidence, but use
> [`FINAL_MASTER_SUCCESSOR_STATUS_20260716.md`](FINAL_MASTER_SUCCESSOR_STATUS_20260716.md)
> for current successor status. Deployed configuration, live provider behavior
> and production remain unproven.

Status: `CANDIDATE LOCALLY VERIFIED / DEPLOYED CONFIGURATION NOT ATTESTED / NO_GO`

Scope is the isolated canonical candidate only. No production/provider/customer
or shared-data mutation occurred, and no raw environment value was inspected or
retained as evidence.

## Implemented candidate controls

- Central logs recursively sanitize credentials, tokens, cookies, common
  provider-secret formats, email/phone PII, errors, circular/deep/oversized data,
  and untrusted content before output.
- Route security uses TypeScript-aware handler/call analysis rather than
  comment/import/string markers and requires direct auth/ownership evidence on
  private dynamic methods.
- QA auth is categorically disabled in production and, elsewhere, requires exact
  isolated Supabase project and auth-user/profile identity.
- Anonymous client-error telemetry is default-off; same-origin is not treated as
  identity.
- Internal system-job execution requires explicit strong secret authority,
  constant-time comparison, rate limiting, and safe denial. Meta token
  encryption, access-key pepper/reveal, and internal/cron secrets reject short,
  repeated, low-entropy, and known-placeholder values.
- Production Stripe requires validated live key mode and live provider objects.
  Explicit test mode is nonproduction-only and uses dedicated test slots;
  subscription-refresh ambiguity is retryable and cannot project stale billing.
- Production lead capture requires non-test Turnstile site/secret keys, exact
  normalized allowed hostnames, expected action, successful verification, and a
  token before persistence.
- Meta CAPI and browser Pixel are default-off. Browser Pixel has an explicit
  versioned allow/decline/revoke cookie control. CAPI currently has no approved
  public-form consent producer or expiry/withdrawal model, so public-lead CAPI
  is intentionally unreachable and suppressed even if the feature flag is
  enabled. Missing/mismatched evidence never reports false queued success.
- Meta OAuth state is user/workspace bound and one-time. The one-time
  authorization-code exchange is never retried after ambiguity.
- Meta launch records, receipts, and immutable input digests are service-role/RPC
  constrained; configured/effective PAUSED state is required and UI copy does
  not imply delivery/spend.
- Tenant-sensitive campaign, asset, lead, job, billing, credit, provider usage,
  SMS, support, GHL, Meta leadgen, and access-key boundaries use exact membership
  and composite identities; broad direct service-role writes are revoked where
  the candidate protocol requires a fenced RPC.
- Load tooling is exact-loopback, no-credentials/no-query, capped,
  isolated-project-attested, synthetic-identity-only, and no-write before any
  lead/provider mutation.
- Rate-limit identity prefers the Vercel-controlled
  `x-vercel-forwarded-for` header only when the runtime is positively identified
  as Vercel, normalizes IPv4/IPv6, ignores generic forwarding chains in unknown
  production proxy topologies, and has spoof-chain regression tests. This
  follows Vercel's official request-header contract:
  <https://vercel.com/docs/headers/request-headers>.
- CSP scripts are nonce-bound and surface-specific; framing is default-deny and
  only exact configured onboarding origins can be admitted.

## Release-environment attestation contract

Guard v4 accepts no raw environment values. Its signed exact-deployment
attestation contains only:

- booleans proving every required fail-safe flag matches its safe state,
  including `ALLOW_META_PIXEL_EVENTS=false`;
- expected Stripe live-mode boolean;
- secret-strength policy booleans for Meta app/token, access-key,
  internal-system/cron, and Stripe webhook secrets; and
- configuration booleans for Turnstile exact host/non-test keys and Meta
  Pixel/CAPI policy-version presence.

Unknown/raw environment fields are rejected. The deployment/project/commit/time
and zero-old-worker drain are signed by an Ed25519 authority pinned only in a
protected external policy outside the repository. The runner independently
supplies that policy's path and exact digest; the target policy is informational
and any target-added key is ignored. No external production root is supplied, so
deployed configuration remains unproven and release mode cannot pass.

## Deterministic proof

- `node scripts/test-security-config-truth.mjs`
- `npm run test:stripe-runtime-mode`
- `node scripts/test-meta-contract-hardening.mjs`
- `npm run test:access-key-security-disposable-db`
- `npm run test:release-guard`
- `npm run routes:security`
- `npm run typecheck`
- `npm run lint`

The suites include placeholder/entropy negatives, Stripe live/test matrices,
Turnstile test-key/hostname/action negatives, CAPI/Pixel consent cases, OAuth
single-fetch ambiguity, internal-runner denial, route-checker decoys, tenant
replay/fence cases, and fabricated/self-signed release evidence.

## Explicit limits and blockers

- Actual deployed flags, key modes, hostname lists, policy versions, and
  secret-strength booleans are not authoritatively attested.
- No live Stripe, Meta, Turnstile, GHL, Twilio, creative, Supabase, or mailbox
  request was made.
- `style-src 'unsafe-inline'` remains for framework-managed inline styles; full
  CSP closure is not claimed.
- Authenticated adversarial browser/runtime proof is blocked without a separately
  authorized isolated project.
- Workspace-selection UX, consent/retention/deletion policy, operator SLA, and
  provider ownership/offboarding require owner/legal decisions.
- The original missing-foundation blocker (`NEW-001`) is superseded by the
  retained 80-migration foundation recovery. Exact clean-seal 104-chain
  security/RLS proof, isolated hosted staging attestation, secret scan, and
  production environment/drain authority are `NOT_YET_RUN`.
