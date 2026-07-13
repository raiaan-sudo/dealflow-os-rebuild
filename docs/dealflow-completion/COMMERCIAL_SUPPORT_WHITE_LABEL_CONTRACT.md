# DealFlow commercial, support, and white-label contract

Status: `INTEGRATED CANDIDATE / FINAL-SEAL PROOF NOT_YET_RUN / HOSTED ACCEPTANCE NOT_YET_RUN / PRODUCTION NO_GO`

## Single-plan acquisition and activation

- The only new DealFlow subscription is Pro at `$297/month`.
- Authenticated, access-key and partner checkout accept only literal `pro`.
- New workspaces and onboarding default to Pro. The obsolete design-preview
  route fails closed, and login/dashboard/results ignore legacy plan-selection
  query parameters.
- Starter/Growth remain parseable only for grandfathered subscriptions carrying
  exact owner-controlled reconciliation authority. They are not selectable or
  advertised to new customers.
- Promotion codes are allowed, but zero-dollar/manual-invoice paths do not
  create a new activation or initial credit.
- Activation is one immutable qualifying positive payment, not onboarding,
  subscription status alone, GHL readiness, launch or first lead.
- One activation grants exactly `$10` once. GHL provisioning consumes only the
  durable activation receipt.

## Credits

- Credits do not expire under the current product contract.
- Static generation reserves `$1`; video generation reserves `$5` before a
  paid provider dispatch.
- Conclusive pre-dispatch release/provider rejection compensates once;
  conclusive success consumes once; possible-write ambiguity becomes operator
  reconciliation and is neither blindly retried nor automatically refunded.
- Zero balance blocks generation. Top-ups are `$25` to `$1,000`, require a
  current paid entitlement and exact existing Stripe customer, and settle only
  against the matching durable intent/session/payment receipt.

Hosted Stripe test-mode checkout/webhook/replay/legacy/zero-dollar proof is
`NOT_YET_RUN`. No live charge, refund or subscription mutation is claimed.

## Support

Ticket and outbox creation are atomic. The user receives a durable correlation
reference even when notification delivery is pending. Reply routing uses the
verified account email transiently; the form does not accept/store a second
plaintext reply address.

Default delivery is `internal_operator_inbox`. Nonproduction acceptance uses
the zero-communication `staging_sink` or an exact loopback mail sink under its
test attestation. External delivery requires an owner-approved exact HTTPS
idempotent gateway/origin, destination, secret-manager token, receipt header,
global/operation flags, production flag, database control and current lease.
Post-dispatch ambiguity becomes `operator_action_required`.

`support@agentdealflow.io` remains only the proposed owner destination. Mailbox
ownership, monitoring, gateway and SLA are `BLOCKED_OWNER_AUTHORITY`. No email,
SMS or external support communication is claimed.

## Verified white-label host and branding

White-label branding is selected only when server-side records yield exactly
one non-deleted, verified, SSL-active domain joined to one active non-deleted
partner. Branding fields are length/type sanitized; logos require safe HTTPS;
invalid/ambiguous records fail closed to DealFlow.

Partner attribution is HMAC-signed, short-lived, exact-host bound and stored in
an HttpOnly secure cookie. It is not derived from a caller-provided slug,
header, query parameter or unverified host. Signing secrets must meet strength
policy.

Exact approved realtor paths can be framed only from configured exact HTTPS
partner origins after the request host independently resolves to that same
verified partner domain. Wildcards, credentials/paths in origins and shared GHL
vendor origins are refused. Login continuation preserves only safe approved
embedded routes. Admin paths remain non-embeddable.

Frame/branding context never grants tenant authority. Every route still
requires normal Supabase auth, active organization membership, RLS/RPC checks,
billing and provider gates. Direct tenants require platform-owned GHL mapping;
partner children require the exact active partner and partner-owned mapping.

Hosted partner-domain login, onboarding, builder, paywall, launch, results,
settings and support proof—plus attacker host, ambiguous domain, disabled
partner, removed member and cross-tenant negatives—is `NOT_YET_RUN`.

## Production authority still required

- Stripe live/test mode and exact product/price authority;
- support destination, gateway, ownership, monitoring and SLA;
- verified production partner domains, frame ancestors and signing-secret
  attestation;
- GHL direct/partner ownership, export, retention and offboarding policy; and
- protected exact-deployment/drain/canary evidence.

No provider, customer, billing, communication or production mutation is
authorized or proven by this contract.
