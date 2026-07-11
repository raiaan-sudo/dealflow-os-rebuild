# NEW-008 native Meta leadgen ingestion — local proof

Proof scope: isolated candidate worktree only. No live Meta request, webhook subscription, Page subscription, shared database write, production mutation, communication, CAPI event, provider record creation, or provider write was performed.

## Implemented contract

- Public `GET /api/meta/leadgen/webhook` implements the Meta hub challenge using a separate, timing-safe `META_LEADGEN_VERIFY_TOKEN` check.
- Public `POST /api/meta/leadgen/webhook` reads at most 64 KiB and authenticates the exact raw bytes with `X-Hub-Signature-256: sha256=<HMAC-SHA256>` using `META_APP_SECRET` before parsing JSON or touching storage.
- Only bounded `page` / `leadgen` deliveries are accepted. Inconsistent Page identity, malformed changes, invalid IDs, empty deliveries, and deliveries above 50 leadgen events fail closed.
- `meta_leadgen_routes` maps one configured provider Page/Form/ad-account identity to an exact organization, campaign owner, campaign, and Meta marketing account. The configuration RPC rejects campaign/marketing-account tenant mismatches and an existing provider identity cannot be retargeted.
- Authenticated `POST /api/integrations/meta/leadgen/routes` is the application provisioning path. It is same-origin and rate limited, re-checks current organization ownership/membership, derives Page/ad-account/token identity from the one connected workspace Meta account, requires one exact successful provider-paused launch lineage plus its tracking contract, and calls the replay-safe route RPC without a provider request. The RPC atomically projects the campaign tracking contract to `instant_form -> dealflow_dashboard` while keeping provider acceptance explicitly unproven until a signed event reconciles.
- A Page/Form match is not enough to persist a lead. The reconciliation worker performs read-only Graph lookups for the lead and ad, then verifies lead ID, form ID, ad ID, and ad-account ID against the signed event and configured route.
- Unknown and ambiguous Page/Form mappings are recorded without assigning an organization. They do not fall back to the first workspace, a client-supplied organization, or a global Meta connection.
- Provider lead fields are bounded and normalized, then persisted through `createVerifiedProviderLeadAndStartConversation`, which re-checks the exact campaign/organization/user tuple before using the canonical lead insertion path.
- A phone number may be retained without inventing SMS consent only inside the exact verified-provider wrapper. Conversation bootstrap remains disabled and no SMS/email operation is called.
- Every accepted mapped event has a durable reconciliation job and per-effect receipts. `agent_notification`, `meta_conversion`, and `provider_mutation` are explicitly `suppressed`; the queued lead-side-effect job has `enabledEffects: []` and `requiredEffects: []` and contains no Meta conversion payload.
- Event claims use an opaque token, monotonic generation, bounded lease, attempt cap, replay identity collision guard, exact tenant settlement checks, and an idempotent provider lead ID.
- Direct INSERT/UPDATE/DELETE/TRUNCATE on the leadgen route/event/effect tables is revoked from anonymous, authenticated, and service-role application paths; the public webhook uses service-role-only fenced RPCs.

All IDs, contact details, tokens, domains, and payloads under `scripts/fixtures/meta-leadgen/` are synthetic offline fixtures. They contain only reserved fake/example data.

## Executed proof

| Check | Result | Covered failure paths |
| --- | --- | --- |
| `npm run test:meta-leadgen` | PASS | positive application provisioning and replay; revoked-member denial; wrong-campaign denial; launch-not-ready denial; incomplete Meta-selection denial; fresh route followed by valid HMAC delivery; invalid signature; verification denial; malformed JSON; oversized body; provider identity mismatch; normalization; replay/busy fencing; unknown mapping; ambiguous cross-tenant mapping; cross-tenant route denial; cross-tenant lead settlement denial; provider lookup unavailable queued for reconciliation; direct service-role DML/TRUNCATE denial; default-suppressed SMS/email/CAPI/provider-mutation effects; v2 worker claim; unique migration versions |
| `npm run typecheck` | PASS | candidate TypeScript contract compiles |
| `npm run lint` | PASS | repository lint passes with the candidate implementation |
| `npm run routes:security` | PASS | only documented GET/POST methods are public and the middleware allowlist contains the exact webhook path |
| `npm run build` | PASS | optimized Next.js build, TypeScript pass, and 47/47 static pages; both leadgen routes appear in the route manifest |
| `SUPABASE_SCHEMA_CHECK_MODE=local node scripts/check-required-schema.mjs` | PASS | all 35 required local migration files are present, including unique leadgen version `20260710235990` |
| `git diff --check` | PASS | no whitespace errors |

The disposable database proof used a fresh, throwaway local PostgreSQL container and removed it when the test exited. It did not use a linked or shared Supabase project.

## Residual acceptance blockers

- No approved live Meta app, App Review result, `leads_retrieval` permission, Page lead-access assignment, webhook subscription, Page `leadgen` subscription, or real Instant Form ID was available or mutated.
- No live Meta delivery or read-only lead/ad lookup was executed. Real payload field semantics, permission behavior, token lifetime, Graph version behavior, rate limits, retries, and provider outage recovery remain not proven.
- No production/staging database received migration `20260710235990_create_meta_leadgen_ingestion.sql`; the broader repository fresh-migration replay is already `NO_GO` because the historical chain starts by altering a missing `campaign_plans` table.
- No live route rows were created. A future approved operator/form-launch workflow must call the authenticated provisioning endpoint with the real campaign and Instant Form ID after provider authorization/launch and before enabling native lead delivery; Page and ad-account identity are derived rather than accepted from the request.
- Meta developer documentation endpoints were not fetchable from this execution environment, so current permission/App Review behavior must be re-verified against Meta's official documentation during live acceptance.

These blockers prevent a production-ready/live-provider claim. They do not weaken the local fail-closed webhook, tenant fencing, replay, normalization, or default-off effect proof above.
