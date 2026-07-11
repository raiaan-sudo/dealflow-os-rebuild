# Onboarding, Activation, and Initial-Credit Truth Tranche

Date: 2026-07-10
Scope: isolated local implementation only; no migration apply, Stripe call, deploy, provider mutation, or production-data write.

## Outcome

This tranche closes the regular authenticated onboarding and workspace-subscription contract:

- One strict shared contract is used by the browser and `/api/onboarding/plan`.
- The contract is realtor-only (`businessType = real_estate_realtor`) and rejects unknown keys.
- Every field collected by the current wizard is persisted in the complete `onboarding_contract`; campaign-effective fields are also materialized into the campaign payload and winning funnel (including language, capture mode, theme, branding, and custom questions). No generic-business fallback remains in the route.
- Draft PII is stored in an authenticated, tenant- and user-scoped server row. Browser storage contains only an expiring navigation pointer. The prior PII-bearing `dealflow-guided-onboarding-v3` key is removed on mount.
- `/api/activation/events` is explicitly journey telemetry. It cannot grant entitlement, commercial activation, or credit.
- `/api/billing/status` reports current subscription access and historical commercial activation as separate facts.
- A commercial activation can be created only from an applied, positive, paid subscription checkout or positive initial-subscription invoice. It is immutable and unique per workspace.
- The initial credit is exactly 1,000 cents-equivalent units ($10), inserted in the same database transaction as the activation and tied to that activation in the credit ledger. Entries are mutation-protected in the candidate, but full historical retention is not claimed until the legacy user/organization deletion foreign keys are replaced under an owner/legal-approved policy.
- Webhook duplicates, an existing activation, stale/out-of-order billing state, renewal invoices, unpaid checkout, and zero-dollar events grant zero initial credit. A qualifying payment without workspace/user identity fails closed so Stripe can retry and an operator can repair the metadata.

## Truth separation

| Fact | System of record | Mutation path | What it does not mean |
| --- | --- | --- | --- |
| Onboarding journey event | `activation_journey_events` | authenticated same-origin telemetry API | payment, activation, entitlement, or readiness |
| Commercial activation | `commercial_activations` | service-role RPC after an applied qualifying Stripe payment | current subscription entitlement or completed setup |
| Current entitlement | `billing_subscriptions` | ordered Stripe subscription sync | historical first activation or GHL/provider readiness |
| Initial credit | `user_credit_ledger` | same transaction as first commercial activation | renewal credit, reconnect credit, or recurring allowance |
| Onboarding draft | `onboarding_drafts` | authenticated tenant/user-scoped GET/PUT/POST | provider setup or live campaign launch |

## Database invariants

The additive migration `20260710180000_activation_onboarding_contract.sql` defines:

- primary key `(organization_id, user_id)` for server-backed onboarding drafts;
- forced RLS and membership/user checks for draft reads/writes;
- a unique telemetry idempotency key per organization/user;
- one immutable commercial activation per organization;
- one unique Stripe source event per commercial activation;
- an advisory transaction lock per organization;
- atomic activation plus `grant_user_credits(1000, ...)`;
- ledger reference type `commercial_activation` and stable organization-scoped idempotency key;
- service-role-only execution for the activation/credit RPC.

The migration was authored and inspected only. It was not applied to any database in this task.

## Deterministic proof

Command:

`node scripts/test-onboarding-activation-billing-contract.mjs`

Result: PASS, 18/18 checks.

Covered fixtures:

- every wizard field propagates through the shared submission builder;
- strict unknown-field rejection;
- realtor-only industry validation;
- daily/monthly budget consistency;
- server-draft round trip and navigation expiry;
- first paid activation and exact $10 grant;
- duplicate and resubscription-shaped event with zero regrant;
- subscription reconnect event with zero grant;
- stale/out-of-order event with zero grant;
- renewal invoice with zero grant;
- unpaid and zero-dollar event with zero grant;
- missing identity fail-closed behavior;
- removal of browser PII persistence;
- complete campaign-document propagation;
- database uniqueness, locking, ledger linkage, and atomicity guards;
- billing-handler activation gating.

Additional verification:

- `npm run typecheck`: PASS before unrelated concurrent edits. A later repeat was blocked by concurrent, out-of-scope union-narrowing errors in `src/lib/services/ghl-provisioning-service.ts`; targeted files remained clean in the subsequent targeted ESLint run.
- Targeted ESLint across the eight TypeScript/TSX implementation files: PASS.
- `npm run build`: application compilation PASS; the later build type phase was blocked by a concurrent, out-of-scope type error in `src/app/api/autonomy/_shared.ts:129`.
- `npm run smoke:offline`: all onboarding, billing, Stripe ordering, credit, and idempotency assertions passed. Two out-of-scope Meta OAuth source assertions failed while the Meta files were concurrently being edited.
- `npm run routes:security`: PASS, including same-origin checks for `/api/activation/events` and both POST/PUT methods on `/api/onboarding/plan`.
- `supabase db lint --local --fail-on error --schema public`: BLOCKED; no local PostgreSQL service was listening on `127.0.0.1:54322`. The command did not use `--linked` and applied nothing.

## Remaining proof boundary and owner-policy blockers

1. The migration must be applied first in an isolated database and concurrency-tested with two simultaneous activation RPC calls. This task intentionally did not touch any database.
2. Owner policy must confirm whether a zero-dollar trial is intentionally *not* a commercial activation. The implemented rule requires positive payment.
3. Owner policy must confirm whether manual/offline invoices are allowed activation sources. The implemented rule accepts only Stripe subscription checkout completion and an initial subscription invoice.
4. The access-key checkout path receives payment before it has a workspace/user identity, then claims the subscription in `access-key-service.ts`. That file was outside this tranche's exclusive edit ownership. It needs a separate, explicit handoff that carries the original qualifying payment proof into the later tenant claim and invokes the same atomic activation RPC exactly once. Until then, the new activation contract is proven for regular workspace checkout, not access-key checkout.
5. No live Stripe webhook, reconnect, subscription resumption, or production database behavior was exercised. Those remain deployment/canary proofs, not local claims.

## Rollback boundary

Application rollback can stop calling the new APIs/RPC without deleting data. Database rollback should not delete `commercial_activations` or `user_credit_ledger` rows because they are financial/audit history. If the feature is withdrawn, revoke the RPC execution grant and leave immutable history intact.
