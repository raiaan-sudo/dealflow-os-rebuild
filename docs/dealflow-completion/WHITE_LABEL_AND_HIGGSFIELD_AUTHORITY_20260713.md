# White-label and Higgsfield authority contract

## White-label partners

White-label behavior is configuration-driven. A customer workspace receives a
partner brand only when all of these server-side records agree:

1. exactly one active `workspace_partner_attribution` row names the authenticated
   workspace and partner;
2. the exact `organizations` row carries that same partner;
3. exactly one active, non-deleted `partners` row exists; and
4. at most one `partner_branding` row belongs to that partner.

Any missing, ambiguous, deleted or cross-partner record returns the DealFlow
default. Host attribution remains independently signed and exact-domain bound.
The offline proof uses two synthetic partners and two synthetic child
workspaces, and proves that neither partner's configuration can brand the other
partner's child.

### Billing and support ownership

The locked owner policy is intentionally simple: DealFlow remains merchant of
record and support owner for every partner-branded workspace. New acquisition
is the single `$297/month` Pro plan; a partner may change presentation tokens,
but cannot silently change the Stripe price, payment authority, credit rules or
support delivery destination. The database enforces `billing_owner =
'dealflow'`, and all tickets still enter DealFlow's tenant-scoped support
ticket/outbox system before any separately authorized external delivery.

A partner branding `support_email` may be shown as contextual help copy on a
verified partner host. It does not grant delivery authority and cannot redirect
the durable support outbox. External delivery remains bound to the globally
approved DealFlow support destination and its existing explicit environment
attestation. This preserves the user's stated `support@agentdealflow.io` /
`admin@agentdealflow.io` ownership while keeping partner branding
configuration-driven.

## Authoritative video path

Higgsfield is the primary video provider. A valid Higgsfield configuration
always wins. A partial Higgsfield configuration fails closed. HeyGen can be
selected only when both `ALLOW_HEYGEN_LEGACY_FALLBACK=true` and its existing
paid-generation authorization are explicitly enabled.

The customer action is the campaign Assets button labelled `Generate video •
$5 credit`. The API pins the selected provider into the durable job payload and
fails before queueing when Higgsfield lacks an exact ready OpenAI-generated
source asset, its matching paid dispatch, or paid authorization. The queued
payload stores only those durable identities, never an expiring provider URL.
The worker re-reads and revalidates both identities immediately before the paid
reservation, then:

1. reserves the tenant-, user-, campaign- and attempt-scoped credit;
2. records a request fingerprint and dispatch fence before the provider POST;
3. records the accepted Higgsfield request id before projecting customer state;
4. creates one provider-bound creative asset and one tenant-scoped polling job;
5. polls by the pinned provider and exact asset identity;
6. imports the completed provider output through a DNS-pinned, provider-host-
   allowlisted HTTPS fetch with every redirect re-resolved and all private,
   loopback, link-local and reserved addresses rejected;
7. enforces a 30-second total deadline, two-redirect limit, 100 MiB limit,
   approved video MIME and matching MP4/QuickTime/WebM file signature;
8. immutably creates the exact DealFlow-owned object at
   `generated-video/{organization}/{user}/{campaign}/{provider}/{asset}.video`
   with no overwrite and no provider URL or raw provider response persisted;
9. atomically binds that object identity and customer URL to the exact paid
   creative asset through a service-only database function, then persists the
   completed campaign video state; and
10. consumes the reserved credit only after completed customer state is
   projected. A provider-render failure releases the reservation; an exhausted
   unknown outcome becomes operator action rather than a false refund or debit.

The create authorization switch does not disable status reconciliation for an
already accepted Higgsfield request. Replay recovers the durable provider
receipt and cannot issue a second POST for the same logical attempt.

Higgsfield receives the source image through a short-lived, HMAC-signed,
first-party DealFlow URL. The signature binds the exact asset, paid dispatch,
organization, user and campaign for no more than twenty minutes. The media
route repeats those database bindings, then retrieves only a projected paid
OpenAI asset through the same public-address/DNS-pinned transport boundary. It
serves only verified PNG, JPEG or WebP bytes with `no-store` and `nosniff`.
Higgsfield therefore never receives the original third-party source URL, and a
tampered, expired, cross-tenant or unpaid source request fails closed.

A provider POST is considered a conclusive rejection only for definitive 4xx
responses. Timeouts, `408`, `409`, `425`, `429`, and 5xx responses are treated
as ambiguous accepted-or-not-known outcomes: they are fenced for
reconciliation/operator action and are never blindly replayed as a second paid
request.

An exact object replay reads custom identity metadata from Supabase Storage's
object-info endpoint, not the version-dependent list payload. It never
re-downloads an expired provider URL when the canonical object already exists.
An upload race accepts only the same service-authored tenant identity. Once the
database binding RPC is attempted, an ambiguous response preserves the object
for deterministic recovery instead of risking deletion of a committed asset.
Only an object created by the current execution may be removed, and only before
any database bind attempt.

Provider media hosts fail closed. Higgsfield accepts `higgsfield.ai` and its
subdomains; the legacy path accepts `heygen.ai` and its subdomains. If an
authorized staging response uses a separate CDN, add only the observed exact
hostname to the comma-separated `HIGGSFIELD_VIDEO_OUTPUT_HOSTS` or
`HEYGEN_VIDEO_OUTPUT_HOSTS` environment value. These values are exact hosts,
not wildcard suffixes. `ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT=true` works only
when `NODE_ENV=test`; it cannot enable loopback media import in staging or
production. The release environment contract must list the two optional host
variables before either is configured, and the value itself must remain out of
sanitized evidence.

The authoritative additive migration is
`20260713025000_add_generated_video_canonical_storage.sql` (migration 100). It
adds a private immutable binding ledger, a replay-safe service-role RPC,
generated-video path validation, creative-asset identity and customer-URL
immutability, and a reserved Storage prefix trigger. It passed the exact
102-migration disposable PostgreSQL 17.6 chain, including a second replay of
migration 100, exact bind replay, cross-tenant/collision rejection, hostile
custom-GUC attempts, direct service-role tampering rejection, and non-service
Storage-prefix mutation rejection. The complete portfolio and final seal must
still pass again before staging or release.

## Evidence boundary

Local mock-provider, source-proxy, storage, database and pure authority tests
make no provider call, paid generation, remote database write or deployment.
Hosted two-partner/two-child browser and RLS proof, an exact configured Supabase
bucket proof, and one authorized real Higgsfield sandbox acceptance remain
external release gates. Until those hosted checks pass, local proof establishes
the implementation and safety invariants but does not claim a live provider
generation or production release.
