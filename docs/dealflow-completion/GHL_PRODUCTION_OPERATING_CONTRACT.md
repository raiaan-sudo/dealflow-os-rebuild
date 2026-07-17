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

1. Create the sub-account using the documented Agency Pro v3 location API and
   the exact owner-approved `snapshotId` bound to the immutable provisioning
   request and receipt.
2. Reconcile the exact temporary request tag through agency-scoped location
   search when create is ambiguous, then restore and read back the clean
   customer-facing location name through the official location PUT/GET routes.
3. Verify the copied snapshot status and exact required-object IDs. This does
   not prove copied funnels/pages/forms are published; provider draft state is
   still fail-closed at the destination/publication boundary.
4. Allocate each website campaign to one manifest-declared campaign slot. A
   slot binds one exact destination URL, exact preinstalled form IDs, and a
   non-overlapping map of DealFlow fields to documented GHL custom-value names.
5. Derive the slot values from the exact organization-fenced campaign plan and
   its persisted realtor onboarding contract: offer, market, audience,
   property/price context, the exact selected primary creative's ID,
   headline/copy/CTA, agent and brokerage identity, phone, language, theme
   colors, and logo.
6. Apply only those documented custom values, then verify the exact
   preinstalled form IDs using the forms read API.
7. Store append-only campaign/revision/lease-bound receipts. Expose the exact
   HTTPS GHL-hosted URL only through
   `resolve_ghl_ready_campaign_destination_v2(organization,campaign,environment)`
   after both steps succeed and the source-plan fingerprint remains current.
8. Permit website lead routing only through that exact ready campaign record.
   Meta Instant Form leads still route through their exact campaign and
   canonical GHL location mapping without pretending that a GHL website funnel
   was their capture surface.
9. Deliver contact, opportunity, tag, and workflow effects through fenced,
   idempotent outbox records and append-only sanitized receipts.
10. Reconcile signed appointment, contact, opportunity-status, and outbound
   follow-up receipt webhooks back to the exact canonical location mapping.
   Message bodies and recipient addresses are not persisted in this receipt.

The preinstalled form is an immutable provider artifact in this supported
model. A campaign's zero-to-three onboarding lead questions become routable
only when their exact normalized question text and field IDs match the
owner-approved slot's `inboundQuestionMappings`. DealFlow has no accepted proof
that GHL custom values can safely change a form field's visible label. Arbitrary
per-campaign questions therefore fail closed at personalization and cannot be
represented as fully automated production funnel creation. Supporting that
vision requires either owner-approved preinstalled question slots with fixed
labels or a documented, sandbox-proven writable form/publication mechanism.

Official capability references:

- Sub-account creation (Agency Pro): https://marketplace.gohighlevel.com/docs/ghl/locations/create-location
- Agency-scoped sub-account search: https://marketplace.gohighlevel.com/docs/ghl/locations/search-locations/
- Sub-account update/readback: https://marketplace.gohighlevel.com/docs/ghl/locations/put-location and https://marketplace.gohighlevel.com/docs/ghl/locations/get-location/
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
- the operation-specific provisioning, lead-delivery, lifecycle-webhook, or
  form-submissions-read flag;
- the matching database-side `ghl_runtime_controls` switch;
- an active installation with an `env:GHL_PRODUCTION_*_TOKEN` credential reference;
- agency authority carrying `locations.write` and `locations.readonly` for
  create, reconciliation, clean-name update, and readback;
- a tenant-consistent canonical mapping and approved preinstalled manifest.

Every flag and database switch defaults to false. Credential values remain in
secret storage and are consumed only inside the bounded request callback.
Marketplace OAuth additionally requires
`GHL_MARKETPLACE_PROVIDER_EFFECTS_ENABLED=true` and
`GHL_MARKETPLACE_PROVIDER_ATTESTATION=DEALFLOW_GHL_MARKETPLACE_EXACT_V1`.
Production must not set the synthetic-account attestation. The exact app,
client, redirect, install URL, scope set, and AES-256-GCM key/version are the
secret-managed `GHL_MARKETPLACE_*` values listed in `.env.example`; changing
any binding requires an explicit reconnect and a new one-time callback state.
The protected one-minute `/api/internal/system-jobs` runner is the authoritative
runtime entrypoint. It evaluates application gates before a claim; claim RPCs
check database controls atomically; workers re-read those controls immediately
before provider construction so a post-claim kill-switch flip performs zero
provider calls. `/api/internal/ghl-worker` delegates to the same service. The
GET-only periodic lane uses the separately protected one-minute
`/api/internal/ghl-form-sweep` runner with a 300-second platform ceiling and a
240-second claim deadline, leaving time for every admitted lease to settle.

### Location-scoped inbound form authority

Native GHL form reconciliation never uses the installation agency token.
HighLevel requires `GET /forms/submissions` to use a Sub-Account token with
`forms.readonly`. For each active location, an owner must create that narrow
token in GHL, store it in the deployment secret manager, and put only its
`env:GHL_PRODUCTION_LOCATION_*_TOKEN` reference in the non-secret binding
registry. Then run:

```bash
npx tsx scripts/configure-ghl-inbound-forms-authority.ts production
```

The command requires the exact production gates plus:

```dotenv
GHL_PRODUCTION_INBOUND_FORMS_BINDINGS_JSON=[{"organizationId":"<uuid>","mappingId":"<uuid>","providerLocationId":"<ghl-location-id>","credentialRef":"env:GHL_PRODUCTION_LOCATION_ACCOUNT_1_TOKEN"}]
GHL_PRODUCTION_INBOUND_FORMS_AUTHORIZATION=DEALFLOW_GHL_PRODUCTION_INBOUND_FORMS_EXACT_V1
GHL_PRODUCTION_INBOUND_FORM_RECONCILIATION_ENABLED=true
GHL_PRODUCTION_INBOUND_FORM_SWEEP_ENABLED=true
GHL_PRODUCTION_FORM_SUBMISSIONS_READ_ENABLED=true
GHL_PRODUCTION_LOCATION_ACCOUNT_1_TOKEN=<secret-manager value; never paste in SQL or logs>
```

The command first commits both database claim gates closed and waits for zero
old reconciliation and periodic-sweep worker claims. It then resolves each canonical mapping, obtains only
the database-approved current form IDs, performs GET-only scope verification
with each location credential, and submits the exact complete mapping set to
one atomic binding transaction. That transaction reopens reconciliation only if every
currently eligible active mapping is present and bound, every zero-customer
submission probe fingerprint is durably tied to the resulting credential
generation and exact form set, and every current proof validates. The same
transaction opens the separately requested sweep gate only after those checks
succeed. A provider, drain, or
binding failure leaves the committed sweep gate closed; a batch failure cannot leave
partial credential rotation. The same transaction clears form-read authority
from every active location omitted from the freshly verified exact set,
including currently unpublished/ineligible locations, so later publication
cannot revive a stale token attestation. Plaintext, agency references,
wrong locations, stale attestations, changed form scopes, ambiguous form
routes, and partial activation all fail closed. The sanitized result contains
only canonical IDs, counts, and a credential-reference fingerprint.

Signed contact webhooks are the priority fast path. A separately gated,
location-scoped periodic sweep covers submissions whose contact webhook is
missing or repeated. It reads one closed form/time window at a time, never
labels a provider API read as a signed webhook, and advances its durable cursor
only after the complete read has been enqueued into the canonical reconciliation
pipeline. The scheduled read lane uses its own
`GHL_PRODUCTION_FORM_SUBMISSIONS_READ_ENABLED` provider kill switch; enabling
the lifecycle webhook never silently authorizes polling.
Every sweep and scope-refresh lease is revalidated against both database gates,
the current mapping credential generation, and the exact current form set
immediately before its GET. Credential rotation starts a fresh bounded
retry/replay budget without deleting the immutable replay audit for prior
generations. Rotation and mapping retirement require both database lanes closed
and zero live sweep, refresh, or reconciliation leases.
GHL exposes live pagination rather than a snapshot: coarse date
filters can include rows outside the exact ISO window, and new submissions can
shift totals or page boundaries during traversal. Pagination drift and
identical cross-page duplicates therefore retry the same window without cursor
advancement; a stable submission ID with conflicting content is operator
action. DealFlow does not claim provider-level exactly-once capture until a
stable traversal succeeds; database receipts and lead projection are
idempotent after that boundary.

Emergency stop is provider-independent. Set
`GHL_PRODUCTION_INBOUND_FORM_RECONCILIATION_ENABLED=false` and
`GHL_PRODUCTION_INBOUND_FORM_SWEEP_ENABLED=false`, then run the same command
with the exact authorization. It closes both database claim switches
first and performs zero credential resolution, provider construction, provider
reads, or binding calls, even when the registry is empty or GHL is unavailable.

This environment-reference workflow is a controlled bootstrap and staging
acceptance path, not the final seamless production onboarding model. HighLevel
access tokens expire and its supported scalable model is a Marketplace OAuth
installation/App Install flow (or the documented agency-OAuth to location-token
exchange), followed by encrypted per-location access/refresh-token storage and
rotation. DealFlow now has a fail-closed local encrypted token store, rotating
refresh runtime, company-to-location exchange, and disposable-database proof.
It does not yet have approved GHL Marketplace client authority or live
synthetic staging install, callback, refresh-rotation, and uninstall evidence.
Therefore production native-form reconciliation remains `NO_GO` and its runtime
gate must stay false until that owner/provider dependency is supplied,
configured, and canary-proven. The manual registry may not be represented as
seamless production onboarding, and local proof may not be represented as live
provider acceptance.

At the 300-user design point and roughly two forms per location, a 15-minute
sweep can create about 57,600 immutable run rows per day, while an 8-10 minute
scope-refresh cadence can add about 43,200 proof rows per day before lead and
receipt records. The current candidate deliberately has no destructive
retention job because no owner/legal evidence-retention policy is approved.
Production is therefore also `NO_GO` until the owner approves a capacity,
partitioning, archival, retention, deletion, and cost-monitoring policy and its
non-destructive staging proof. Local sealing and isolated staging may proceed;
300-user durable production readiness may not be claimed from source tests.

Official references:

- Location token exchange: https://marketplace.gohighlevel.com/docs/ghl/oauth/get-location-access-token/
- OAuth token/refresh contract: https://marketplace.gohighlevel.com/docs/ghl/oauth/get-access-token/
- Sub-Account token requirement for submissions: https://marketplace.gohighlevel.com/docs/ghl/forms/get-forms-submissions/

## Retry and ambiguity rules

- An empty native-form result uses a bounded staged observation schedule:
  30 seconds, 1 minute, 2 minutes, 5 minutes, 10 minutes, 20 minutes, then one
  final read at the one-hour boundary. It performs at most eight reads per
  signed lifecycle receipt and at most 200 form GETs at the hard 25-form route
  ceiling; it never polls every form every two minutes for an hour.
- The shared system-job invocation claims at most one reconciliation receipt.
  Each form GET has one attempt and a three-second transport timeout, making
  the provider-read wall-time ceiling 75 seconds before settlement. Durable
  reconciliation retries replace in-request retries so later support,
  reporting, launch, and optimization stages cannot be starved.
- Provider failures use bounded retry behavior with a 12-attempt ceiling.
- A recoverable operator terminal can be replayed only through
  `replay_ghl_inbound_form_reconciliation_v1` with exact service authorization,
  the original organization and receipt, a reason and actor, an open database
  gate, an active mapping, a fresh location-scoped attestation, and a currently
  eligible form route. The RPC preserves the signed receipt and lead/submission
  idempotency, records bounded replay history, and rejects cross-tenant, stale,
  duplicate, unsafe-code, or sixth replay.
- Provider writes use `no-retry` transport behavior.
- A response without a durable provider object ID is not success.
- A transport failure or dispatched-write HTTP `408`, `429`, or `5xx` result
  becomes `uncertain`; it is never blindly replayed. Credential failures and
  exhausted discovery reads remain explicitly non-mutating.
- Location creation ambiguity requires exact provider reconciliation before a
  retry.
- Create Sub-Account has no official external-id or metadata field. DealFlow
  therefore creates with one temporary `DFR1` SHA-256 request tag in the name,
  then reconciles an ambiguous create only through the official agency-scoped,
  bounded `GET /locations/search` contract. A candidate must match the complete
  tag, country, timezone, and agency scope. Zero matches remain non-conclusive
  for a 15-minute visibility window; multiple matches, malformed pagination, or
  a bounded-search overflow require operator action and never authorize a blind
  create replay.
- The temporary tag is not an accepted customer-facing terminal state. After
  the provider location ID is durably recorded, both normal and recovered
  creates must pass an idempotent official `PUT /locations/{locationId}` clean
  name update plus exact `GET /locations/{locationId}` readback before snapshot
  work can begin. A clean name is never rewritten; an out-of-band name is never
  overwritten automatically; ambiguous cleanup is retried only behind exact
  pre-read/readback and a six-attempt fence.
- Provider receipts are append-only and outbox settlement is lease-fenced.
- Expired campaign-personalization leases become `uncertain`; they are not
  reclaimed until the exact values fingerprint is supplied to the fenced
  reconciliation RPC.
- A campaign-plan change resets the same stable slot to a new contract revision.
  A change while a provider effect is in flight settles as operator-required,
  and a slot's destination/form/custom-value-name wiring cannot mutate in place.
- Retryable campaign-personalization failures have a bounded attempt ceiling;
  the final attempt becomes operator-required instead of looping forever.
- Contact must succeed before opportunity, tag, or workflow effects can claim.
- Same lead/effect/location idempotency keys cannot change tenant or payload.
- Location retirement requires all database gates closed and zero live
  reconciliation, personalization, provisioning, dispatching, or uncertain
  workers. It clears expired leases, cancels tied nonterminal provisioning and
  undispatched effect work, preserves READY evidence with retirement metadata,
  clears form-read authority, and makes the location inactive.

### Operator visibility and recovery

The protected system-jobs result must report the reconciliation batch's
processed and per-outcome counts and sanitized error codes. It must not include
contact IDs, names, phone numbers, email addresses, answers, provider response
bodies, or credential references. Operators can independently inspect the
durable aggregate backlog without reading customer rows:

```sql
select environment, status, coalesce(last_error_code, 'none') as code,
       count(*) as receipts
from public.ghl_inbound_form_reconciliations
group by environment, status, coalesce(last_error_code, 'none')
order by environment, status, code;
```

For an allowed recoverable terminal, first rotate and re-verify the exact
location authority through the fenced batch command, confirm the runtime gate
is open, then invoke the replay RPC once with the exact organization and
reconciliation IDs, an operator identity, reason, and
`DEALFLOW_GHL_INBOUND_RECONCILIATION_REPLAY_EXACT_V1`. A repeated call while the
receipt is pending/processing/completed is rejected. Any non-allowlisted error
requires investigation and a new proven remediation, not a direct row update.

## Direct and white-label ownership

- A direct realtor organization must have `tenant_kind=direct_realtor`, no
  partner ID, and a platform-owned installation.
- A white-label child must have `tenant_kind=partner_child`, its exact partner
  ID, and a matching partner-owned installation.
- A payment event cannot move between users, organizations, subscriptions,
  partners, installations, manifests, environments, or locations.
- One routable provider location cannot belong to two organizations.

## Campaign-slot manifest contract

New multi-campaign manifests declare `personalization_contract.campaignSlots`.
Each slot has a unique `slotKey`, unique HTTPS `destinationUrl`, one or more
exact `requiredFormIds`, and `customValueNames` covering every canonical
DealFlow campaign field. Provider custom-value names cannot repeat within or
between slots and cannot overlap shared base custom values. This prevents one
campaign from overwriting another campaign's location-global values.

A legacy root-only personalization contract is accepted for exactly one
campaign. A second website campaign fails closed until the owner installs an
approved non-overlapping slot contract; DealFlow never silently reuses that
single destination or overwrites its values.

## External acceptance still required

Source and deterministic database tests cannot prove provider account authority,
Agency Pro entitlement, installed snapshot contents, OAuth/PIT scopes, webhook
subscription, or live provider behavior. Those require a separately authorized
GHL sandbox acceptance and later a production canary. Production flags and
database switches must remain false until that evidence is approved.
