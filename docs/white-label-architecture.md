# DealFlow White-Label Architecture

DealFlow white-label is one product engine with partner-branded entry points. It does not clone the app, fork the database, or create partner-specific campaign logic.

## Core Model

- Native DealFlow records keep `partner_id = null`.
- Partner-attributed accounts store `partner_id` on the organization/account and are locked through `partner_accounts`.
- Partner users are scoped through `partner_memberships`.
- Partner dashboards read through server-side membership checks.
- Platform admins use `/admin/partners/*`.

## Resolution Order

Partner context is resolved server-side only:

1. Verified custom domain.
2. `/p/:partnerSlug/start` or `/p/:partnerSlug/invite/:code`.
3. Invite code.
4. Admin/import attribution.
5. Native DealFlow fallback.

Unknown or unverified domains fall back to native DealFlow and must not leak branding.

## Billing And Commissions

DealFlow remains merchant of record in V1.

- Stripe Checkout metadata includes `partner_id`, `partner_slug`, and attribution source when present.
- Stripe customer metadata includes partner identifiers.
- Webhook subscription sync preserves partner attribution.
- Invoice payment creates a pending `partner_commission_events` ledger row.
- Refunds, disputes, automated payouts, and Stripe Connect are intentionally not automated in V1.

## Security Rules

- Frontend never supplies trusted `partner_id`.
- Partner access is resolved from server-side route/domain/invite context.
- Partner users cannot access native users, other partner data, provider secrets, raw webhooks, or global admin controls.
- RLS policies force partner membership on partner tables.
- Service-role paths must still apply explicit partner/account scoping.

## Rollout

Feature flags:

- `WHITE_LABEL_ENABLED`
- `PARTNER_SIGNUP_ENABLED`
- `PARTNER_DASHBOARD_ENABLED`
- `CUSTOM_DOMAINS_ENABLED`
- `PARTNER_EMAIL_BRANDING_ENABLED`
- `VERTICAL_CONFIGS_ENABLED`

Recommended rollout:

1. Apply migration in staging.
2. Create one internal test partner.
3. Verify slug and invite signup.
4. Verify partner dashboard isolation.
5. Verify Stripe metadata and commission ledger in test mode.
6. Pilot one real partner via slug/invite.
7. Pilot custom domain only after DNS/SSL proof.

## Rollback

Disable white-label feature flags. Native DealFlow continues because native records are nullable partner scope and partner routes are separate from core customer flows.
