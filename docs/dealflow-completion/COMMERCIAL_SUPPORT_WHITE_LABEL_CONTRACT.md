# Commercial, Support, and White-Label Contract

## New customer acquisition

- The only new DealFlow subscription is Pro at `$297/month`.
- Both authenticated checkout and public access-key checkout accept only the
  literal `pro` tier. Partner checkout uses the same acquisition rule.
- Stripe promotion codes remain allowed. A coupon may reduce the applied price,
  but a zero-dollar checkout or manual invoice cannot newly activate a workspace
  or grant the initial `$10` credit.
- Starter and Growth remain parseable only for existing subscriptions. A Stripe
  webhook may preserve either tier only when the subscription metadata names the
  same tier and carries `legacy_plan_tier_reconciled=true`. Missing or conflicting
  authority moves the subscription to `operator_action_required` and grants no
  launch access.
- Subscription status alone is insufficient for a new workspace. Entitlements
  require the immutable positive-payment `commercial_activations` row. A
  pre-existing account without that row is allowed only when an owner-controlled
  reconciliation writes `legacy_commercial_activation_reconciled=true` into the
  persisted billing metadata after verifying its historical payment.
- GHL provisioning may consume only the durable `commercial_activations` row.
  A Stripe customer, Checkout Session, subscription id, or `active`/`trialing`
  projection is not provisioning authority by itself.

## Credit rules

- Credits do not expire.
- Image generation reserves `$1`; video generation reserves `$5` before the
  provider action.
- A conclusive pre-dispatch release or provider rejection compensates the debit
  exactly once through the unique provider-event ledger relationship.
- A conclusive success consumes the reservation.
- An ambiguous post-dispatch outcome becomes `operator_action_required`; it is
  neither refunded nor automatically retried until reconciliation proves the
  provider outcome.
- Top-ups are between `$25` and `$1,000`, require an active paid subscription and
  its existing Stripe customer, and settle only against the exact durable intent,
  customer, amount, currency, Checkout Session, event, and payment receipt.

## Support delivery

Creating a ticket and its outbox row is atomic. Every successful user response
includes the correlation reference; delivery is asynchronous and never controls
whether the ticket itself exists. Reply routing uses the verified email already
held on the authenticated account. The form does not accept or persist a second
plaintext reply address. The delivery worker reads the account email transiently
under its exact lease and sends it only to the approved adapter as `replyTo`.

Delivery defaults to `internal_operator_inbox`. External delivery requires all
of the following:

1. An explicit owner destination in `SUPPORT_EXTERNAL_DESTINATION`.
2. An exact HTTPS delivery endpoint and exact allowed origin.
3. An idempotent gateway that honors the outbox idempotency key and returns an
   `x-support-delivery-receipt` header.
4. The explicit external enable flag, the exact owner attestation, and a secret
   token stored in the deployment secret manager.
5. In production, the additional production enable flag. Production external
   delivery is disabled by default.

The canonical proposed destination is `support@agentdealflow.io`; this is
documentation only, not an active configuration or proof that the mailbox is
owned, monitored, or appropriate. Owner approval remains required.

Nonproduction acceptance uses either the zero-communication `staging_sink` or
the explicit loopback-only `mail_sink` with its test-only attestation. No test
may send a real email. Successful external or mail-sink delivery records a
durable receipt containing the ticket, organization, user reference, adapter,
scope, destination hash, provider receipt, and timestamp. The plaintext
destination is not stored in the receipt table. Conclusive pre-dispatch failures
use the bounded retry schedule. A timeout, receipt-persistence failure, or other
post-dispatch ambiguity immediately becomes `operator_action_required`; it is
never retried until reconciliation proves whether the gateway accepted the
idempotency key.

## White-label embed

The full explicitly approved realtor journey is embeddable on ClickToScale app
hosts: onboarding, campaign build completion, paywall, funnel/creative review,
preview, launch, launch progress/success, checkout return, results/dashboard,
settings, and support. Authentication continuation is permitted only when it
returns to one of those exact paths. Admin paths remain non-embeddable.

An authenticated workspace resolves its partner branding from the active
workspace attribution first and then loads only that exact active partner.
Product/brand name, validated primary color, optional HTTPS logo reference, and
the `Powered by DealFlow` decision flow through the shared application layout.
Client-controlled partner ids never select branding.

Frame access is not tenant authority. Every embedded request continues through
normal Supabase authentication, organization membership, RLS, RPC tenant
checks, billing gates, and provider write gates. Exact HTTPS frame ancestors
must be configured; wildcards and shared vendor origins are refused.

## External owner gaps

- Confirm ownership and monitoring of the support mailbox.
- Select or implement the idempotent HTTPS email-delivery gateway.
- Store its endpoint, exact allowed origin, token, destination, and attestations
  through the deployment secret manager.
- Approve production activation only after the nonproduction mail-sink journey,
  duplicate request, retry, ambiguous-result reconciliation, and dead-letter
  tests pass in hosted staging.
