# GHL production operating contract

## Supported model

DealFlow uses an owner-approved, preinstalled GHL snapshot/template. DealFlow
does not claim to publish snapshots, funnels, pages, forms, calendars, workflows,
or other snapshot contents through an undocumented API.

After `record_commercial_activation_with_initial_credit` has atomically
persisted the immutable first qualifying paid `commercial_activations` receipt,
DealFlow records one idempotent `ghl_billing_activation_requests` row for that
exact activation, organization, user, Stripe subscription, deployment
environment, and partner attribution. Subscription status, `trialing`, renewal,
or reconnect events are never sufficient. The database then either creates one
provisioning run or records the exact configuration blocker. No provider call
occurs in the payment webhook.

The supported provider sequence is:

1. Create the sub-account using the documented Agency Pro location API.
2. Verify the owner-preinstalled snapshot status and exact required-object IDs.
3. Personalize only documented location custom values.
4. Verify the exact preinstalled form IDs using the forms read API.
5. Store the approved HTTPS GHL-hosted destination URL with the exact
   personalization/form-verification receipt and expose it through
   `resolve_ghl_ready_destination_v1` for campaign binding.
6. Permit lead routing only after the personalization record is `ready`.
7. Deliver contact, opportunity, tag, and workflow effects through fenced,
   idempotent outbox records and append-only sanitized receipts.
8. Reconcile signed appointment, contact, opportunity-status, and outbound
   follow-up receipt webhooks back to the exact canonical location mapping.
   Message bodies and recipient addresses are not persisted in this receipt.

Official capability references:

- Sub-account creation (Agency Pro): https://marketplace.gohighlevel.com/docs/ghl/locations/create-location
- Custom values: https://marketplace.gohighlevel.com/docs/ghl/locations/custom-value/index.html
- Forms read surface: https://marketplace.gohighlevel.com/docs/ghl/forms/forms/
- Contact upsert: https://marketplace.gohighlevel.com/docs/2021-04-15/ghl/contacts/upsert-contact/
- Opportunity upsert: https://marketplace.gohighlevel.com/docs/ghl/opportunities/upsert-opportunity/
- Contact workflow enrollment: https://marketplace.gohighlevel.com/docs/ghl/contacts/workflow/
- Appointment webhooks and Ed25519 signing: https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/

## Production gates

Production provider effects require all of the following at the moment of use:

- exact DealFlow production deployment target and Vercel environment;
- exact attested production Supabase project ref;
- exact `DEALFLOW_GHL_PRODUCTION_EXACT_V1` provider attestation;
- exact HTTPS provider origin `https://services.leadconnectorhq.com`;
- global `GHL_PRODUCTION_WRITES_ENABLED=true`;
- the operation-specific provisioning, lead-delivery, or lifecycle-webhook flag;
- the matching database-side `ghl_runtime_controls` switch;
- an active installation with an `env:GHL_PRODUCTION_*_TOKEN` credential reference;
- a tenant-consistent canonical mapping and approved preinstalled manifest.

Every flag and database switch defaults to false. Credential values remain in
secret storage and are consumed only inside the bounded request callback.
The protected one-minute `/api/internal/system-jobs` runner is the authoritative
runtime entrypoint. It evaluates application gates before a claim; claim RPCs
check database controls atomically; workers re-read those controls immediately
before provider construction so a post-claim kill-switch flip performs zero
provider calls. `/api/internal/ghl-worker` delegates to the same service.

## Retry and ambiguity rules

- Reads may use bounded retry behavior.
- Provider writes use `no-retry` transport behavior.
- A response without a durable provider object ID is not success.
- A transport failure after a possible write becomes `uncertain`; it is never
  blindly replayed.
- Location creation ambiguity requires exact provider reconciliation before a
  retry.
- Provider receipts are append-only and outbox settlement is lease-fenced.
- Contact must succeed before opportunity, tag, or workflow effects can claim.
- Same lead/effect/location idempotency keys cannot change tenant or payload.

## Direct and white-label ownership

- A direct realtor organization must have `tenant_kind=direct_realtor`, no
  partner ID, and a platform-owned installation.
- A white-label child must have `tenant_kind=partner_child`, its exact partner
  ID, and a matching partner-owned installation.
- A payment event cannot move between users, organizations, subscriptions,
  partners, installations, manifests, environments, or locations.
- One routable provider location cannot belong to two organizations.

## External acceptance still required

Source and deterministic database tests cannot prove provider account authority,
Agency Pro entitlement, installed snapshot contents, OAuth/PIT scopes, webhook
subscription, or live provider behavior. Those require a separately authorized
GHL sandbox acceptance and later a production canary. Production flags and
database switches must remain false until that evidence is approved.
