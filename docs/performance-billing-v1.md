# Performance Billing V1

## Model

Performance is a self-serve plan with Starter-equivalent access:

- $97/mo base subscription.
- $3 per qualified lead as metered monthly usage.
- No free trial in V1.
- One Stripe Checkout creates one subscription with two recurring items:
  - licensed base price: `STRIPE_PERFORMANCE_BASE_PRICE_ID`
  - metered lead price: `STRIPE_PERFORMANCE_LEAD_PRICE_ID`

The meter event name defaults to `dealflow_billable_lead` and can be configured with `STRIPE_PERFORMANCE_LEAD_METER_EVENT_NAME`.

## Billable Lead Rule

A lead is billable only when all are true:

- The lead is saved by the public lead capture flow.
- Consent source is `public_lead_capture_form`.
- The lead is tied to an active or trialing Performance subscription.
- The subscription metadata contains the Performance metered Stripe subscription item.
- The lead is not load-test, test, internal, admin, imported, spam, invalid, or duplicate.

Lead capture never calls Stripe inline. It queues `performance_lead_billing` after the lead and normal side-effect jobs are saved.

## Exactly-Once Ledger

`lead_billing_events` is the local source of truth.

Important controls:

- unique `lead_id`
- unique `idempotency_key`
- idempotency key format: `performance_lead:{organizationId}:{campaignId}:{leadId}`
- statuses: `pending`, `reported`, `skipped`, `failed`, `credited`

Retries reuse the same ledger row and Stripe idempotency key. A previously reported row is not reported again.

## Rollout Gates

Before production rollout:

1. Create Stripe test-mode Performance base price.
2. Create Stripe test-mode Performance metered lead price and billing meter.
3. Set test env vars.
4. Run `npm run test:performance-billing`.
5. Complete test-mode Checkout and verify one subscription with two items.
6. Submit one approved QA lead through a safe test funnel.
7. Verify one `lead_billing_events` row and one Stripe meter event.
8. Retry the job and confirm no duplicate meter event.
9. Preview invoice/test clock to confirm base plus usage invoice.

Production Stripe products, prices, meters, env vars, and live meter events require explicit approval.
