# Account deletion and provider offboarding

## Release boundary

This tranche replaces the former email-only instruction with a verified,
tenant-fenced deletion lifecycle. The authoritative additive migration is
`supabase/migrations/20260713026000_add_account_deletion_and_provider_offboarding.sql`.
It must be released schema-first and replayed from a blank database before the
application build. This tranche does not authorize deployment by itself.

## Customer and access truth

Only the exact workspace owner may submit. Submission requires the account
email, the exact destructive phrase, an idempotency key, and either the current
password or a recently issued AAL2 session. Password verification uses an
ephemeral Supabase client; the password is never stored, logged, or receipted.

The creation RPC is executable only by `service_role`, accepts the actor and
workspace from the verified server route, and snapshots a server-owned,
owner/legal-approved retention configuration. Authenticated callers cannot call
it directly and cannot supply or shorten retention policy. A shared user across
multiple workspaces fails closed rather than deleting user-scoped records across
tenant boundaries.

The migration intentionally seeds the retention configuration as unapproved:
both authority hash and approval timestamp are `NULL`, constrained as an exact
pair. Request creation fails with
`account_deletion_retention_authority_pending` until genuine owner/legal
authority is recorded out of band. No synthetic hash or migration timestamp is
treated as approval.

`ACCOUNT_DELETION_EXECUTION_ENABLED` gates accepting a request and claiming
worker tasks. When false, the API rejects before identity, provider, or database
mutation. It never accepts and strands a customer.

Accepted requests immediately create a durable suspension, independent of every
feature flag:

- the proxy checks a boolean-only authenticated suspension RPC before serving
  private routes or APIs;
- app context checks the suspension with server authority before bootstrap;
- restrictive RLS removes authenticated visibility;
- tenant triggers fence both OLD and NEW scopes for authenticated and
  service-role writes, except the exact transaction-local deletion executor;
- creative assets are fenced through their immutable campaign tenant join; and
- a narrow service-role Stripe exception accepts only sanitized webhook receipt
  claims/settlements and conclusive cancellation/nonrenewal projections. It
  cannot restore product access.

Closing the execution flag later cannot restore a suspended workspace. Public
`/data-deletion` status remains available without exposing tenant/provider IDs.

## Durable lifecycle and data coverage

Sixteen sequential, idempotent tasks cover suspension, session revocation,
Stripe, Meta, HighLevel, support, analytics, creative storage, operational
deletion, financial isolation and expiry purge, receipt-detail expiry, auth soft
deletion, and final completion. Claims use bounded leases and generations.
Retries are bounded. Ambiguous provider writes reconcile before replay.
Exhaustion or missing authority becomes `operator_required`.

The generation-fenced durable worker owns `/api/internal/system-jobs` work;
Vercel no longer schedules that generic route. The dedicated GHL form sweep is
the only retained one-minute Vercel cron. Account deletion is an isolated,
bounded worker stage and takes at most five claims per cycle. When execution is
disabled it returns a truthful no-claim result without failing unrelated
stages. When enabled it uses
the same database lease, claim token, generation, predecessor, retry, and legal
hold fences as the manual internal worker; there is no separate unauthenticated
cron route.

Legal holds are append-only, require an enabled operator plus a hashed authority
reference, and block retention/destructive tasks without restoring access. An
operator may requeue any task. Manual completion is limited to Stripe, Meta, and
HighLevel and accepts only provider-specific result codes plus hashed evidence.
Internal, storage, auth, retention, and final tasks cannot be manually completed.

The migration builds and verifies a classification ledger for every current
public table with an organization, workspace, user, or owner scope. Every entry
is assigned `delete`, `anonymize`, `provider_detach`, or `legal_retain`, an exact
executor, a retention class, and its PII-bearing columns. This covers the
lead/campaign graph and fields such as appointment notes, campaign-lead contact
answers, import paths/errors, deal contacts/notes, generated payloads, internal
notes, job customer/address/notes, marketing tokens/metadata, autonomy/system
records, and provider records whenever those relations exist. Migration-time
coverage fails if any scoped relation is unclassified.

Creative storage uses a server-only inventory RPC joining `creative_assets` to
`campaign_plans.organization_id` and immutable user/campaign identity. Only
canonical `creative-assets` paths are returned to object storage. Manual uploads
must use the exact user/campaign/file path. Higgsfield and HeyGen generated-video
objects are eligible only when an exact
`private.generated_video_storage_bindings` row matches the organization, user,
campaign, provider, bucket, and path. Database-only rows are deleted after
provider reconciliation; orphan, mismatch, or cross-tenant ambiguity requires
an operator. The final task independently proves zero disallowed scoped rows/PII
before completion.

Financial/security records remain only until their snapshotted expiry, after
which a dedicated purge must succeed. Receipt details expire separately to
permanent minimal pseudonymous tombstones. A blocked purge remains non-complete.

## Provider rules

- Stripe reads authoritative state before cancellation/nonrenewal with a stable
  idempotency key. Timeouts, rate limits, conflicts, and 5xx reconcile before a
  write replay. Conclusive task settlement atomically projects local canceled or
  nonrenewing state. A sanitized, prevalidated signed callback can still append
  its receipt and correct a suspended cancellation projection; unsafe active
  reactivation is rejected and suspension remains true.
- Meta reads `/me/permissions` before revocation, uses the fixed Graph host and
  bearer header, and clears the encrypted token only after conclusive evidence.
- HighLevel uses official v3 `GET /locations/:locationId` and
  `DELETE /locations/:locationId`. Ownership is tri-state. Exact mapping,
  installation, ready run, succeeded location-create outbox/receipt, tenant, and
  owner evidence are required for provider delete. Only a separate immutable,
  exact-tenant `customer_connected` origin attestation permits local-only
  detach. Missing, mismatched, unreceipted, or ambiguous evidence is unresolved
  and requires an operator without provider delete or local completion. Owned
  404 is idempotent success; ambiguous DELETE transport reconciles by GET.

## Gates

- `ACCOUNT_DELETION_EXECUTION_ENABLED=true`: accept and process lifecycle work.
- `ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED=true`: allow deletion-provider writes.
- `GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED=true`: allow HighLevel deletion
  writes, subordinate to exact production/sandbox project, host, credential,
  and attestation gates.

All default off. The worker also requires the internal-system bearer secret.
No flag bypasses identity, scope, ownership, hold, claim, receipt, or suspension.

## Verification evidence

- Pure contract: 16 tasks, service-role-only creation, separate financial and
  receipt expiry, tenant storage RPCs, secret-safe receipts, fail-closed flags,
  pending owner/legal policy authority, authenticated scheduled execution,
  access fencing, and truthful states.
- HighLevel simulation: owned delete, attested non-owned detach, unresolved and
  cross-tenant denial, read-before-delete, 404 idempotency, kill switch,
  identity mismatch, ambiguous crash, and authoritative reconciliation. No real
  provider request occurs.
- Native PostgreSQL 17.6: exact migration chain including migration 101 followed
  by two exact migration-101 replays; all 16 tasks complete with 17 receipts,
  server-only owner/idempotency checks, inventory coverage, provider-only
  operator recovery, legal hold, OLD+NEW service-role suspension,
  post-suspension Stripe cancellation reconciliation, two-tenant manual and
  generated-video creative inventory/finalization, retention expiry,
  zero-disallowed-PII proof, and preservation of tenant B.

Run:

- `node scripts/test-account-deletion-offboarding-contract.mjs`
- `tsx scripts/test-account-deletion-ghl-offboarding.ts`
- `node scripts/test-account-deletion-offboarding-disposable-db.mjs`

Hosted staging must then exercise owner submission, immediate loss of private
access, public status, sandbox/test provider behavior, legal hold, operator
recovery, and final tombstones before production flags are enabled.
