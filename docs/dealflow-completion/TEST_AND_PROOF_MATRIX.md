# DealFlow test and proof matrix

> **Predecessor proof matrix.** Historical pass records remain valid only for
> their bound source states. Current successor truth is
> [`FINAL_MASTER_SUCCESSOR_STATUS_20260716.md`](FINAL_MASTER_SUCCESSOR_STATUS_20260716.md):
> 108 migrations, 91 commands per final round, both rounds and hosted staging
> `NOT_YET_RUN`, production `NO_GO`.

Overall verdict: `NO_GO`
Candidate seal: `PENDING_FINAL_SEAL`
Current migration inventory: `104`
Two final exact-seal rounds: `NOT_YET_RUN`
Isolated hosted staging acceptance: `NOT_YET_RUN`
Production release proof: `NOT_YET_RUN`

This matrix intentionally distinguishes retained historical evidence, targeted
working-tree checks, the required final clean-seal portfolio, isolated staging,
and production. A pass in one column never implies a pass in a later column.

## Status vocabulary

- `HISTORICAL_PASS`: immutable evidence for an earlier exact source state.
- `WORKING_TREE_PASS`: a targeted check observed before the final clean seal;
  it must be repeated by the final runner.
- `PENDING_FINAL_SEAL`: identity cannot exist until all candidate changes are
  committed and the worktree is clean.
- `NOT_YET_RUN`: no qualifying proof has been executed for this candidate and
  environment.
- `BLOCKED_OWNER_AUTHORITY`: a policy/credential/ownership decision cannot be
  fabricated by code.
- `SKIPPED_SAFETY`: intentionally omitted because it would communicate, spend,
  charge, or mutate an unauthorized provider/production system.

## Historical proof, preserved without reinterpretation

| Evidence | Status | Exact limit |
|---|---|---|
| Production baseline source/deployment ancestry for the canonical core domains | `HISTORICAL_PASS` | Does not cover three independent subdomains and does not identify the current candidate |
| Frozen recovered 80-migration PostgreSQL 17.6 foundation portfolio | `HISTORICAL_PASS` | Proves the recovered foundation and its retained oracle; it is not proof of extensions 81-104 |
| Earlier 82/87/89/90/91/98 migration tranches and the 99/102-migration checkpoints | `HISTORICAL_PASS` where retained | Intermediate historical milestones only; none is the exact current 104-migration seal |
| Exact prior-103 isolated-staging migration state | `PREDECESSOR_PASS` | Read-only proof pins the only acceptable staging pre-state for forward migration 104; it does not prove migration 104 or the current candidate |
| Earlier anonymous screenshot and accessibility tranches | `HISTORICAL_PASS` where retained | Earlier source/runtime/viewports only; not hosted authenticated acceptance |

Files under `docs/dealflow-completion/evidence/` keep their original counts and
wording as historical artifacts. Current operational documents must not quote
those counts as the current candidate inventory.

## Current local exact-seal requirements

Every row below must bind to the same clean commit, tree, tracked-file digest,
lockfile digest, migration digest, Node 24 runtime, PostgreSQL 17.6 runtime, and
final runner version. The authoritative result is currently `NOT_YET_RUN`.

| Portfolio | Required proof | Current exact-seal result |
|---|---|---|
| Install and supply chain | clean `npm ci`; production and full dependency audit; release secret scan; no unexpected lock drift | `NOT_YET_RUN` |
| Static quality | `npm run lint`; `npm run typecheck`; `git diff --check`; repository/schema/route/operator checks | `NOT_YET_RUN` |
| Production build | deterministic production build; route inventory; safe local smoke | `NOT_YET_RUN` |
| Commercial/activation | Pro-only `$297` acquisition, qualifying positive payment, exact-once `$10` credit, legacy-plan reconciliation and zero-dollar negatives | `NOT_YET_RUN` |
| Onboarding/campaign | explicit persistence, full field propagation, destination/qualification independence, single-primary creative, scheduling at 9 a.m. Eastern | `NOT_YET_RUN` |
| Multilingual | EN/FR/ES normalization, campaign/funnel/form/consent/thank-you/metadata propagation, invalid fallback | `NOT_YET_RUN` |
| White-label | verified-domain lookup, signed exact-host attribution, safe branding, iframe allowlist, auth continuation, attacker/disabled/ambiguous negatives | `NOT_YET_RUN` |
| GHL | sandbox/production gate contracts, integrated campaign-slot/periodic-sweep chain, endpoint write-ambiguity proof, provisioning/lifecycle/personalization, bounded typed launch-readiness polling, lead idempotency, location-scoped form reads, rotation/replay/retirement, stale lease and ambiguity recovery | `NOT_YET_RUN` |
| Meta OAuth/launch | exact scope/state/return contract, immutable launch input, PAUSED receipt lineage, manual/scheduled lease and ambiguity fencing | `NOT_YET_RUN` |
| Meta activation | customer preauthorization, exact budget/account/object binding, ACTIVE evidence, ordered activation, stale lease/replay/terminal recovery | `NOT_YET_RUN` |
| Meta Instant Forms/leads | durable provisioning, exact form route, signature/dedupe, tenant denial, reconciliation, canonical GHL delivery | `NOT_YET_RUN` |
| Reporting/optimizer | freshness, incomplete-evidence HOLD, owner policy binding, launch/primary-object/ACTIVE reread, one-use dispatch, scale ceiling/cooldown, stale-worker and ambiguity recovery | `NOT_YET_RUN` |
| Authenticated legacy reporting policy repair | reproduce hosted SQLSTATE `42501`; move all 18 retained member policies to the private helper; preserve public-helper revocation; authorized member read, cross-tenant/anonymous denial and replay safety | `TARGETED_WORKING_TREE_PASS / FINAL_SEAL_NOT_YET_RUN` |
| Billing/credits/provider use | Stripe mode, webhook claims, financial integrity, top-up intent, reserve/settle/compensate, ambiguous paid attempt | `NOT_YET_RUN` |
| Creative integrity | Higgsfield/creative host gates, SSRF/size/content checks, immutable storage identity, exactly one primary asset | `NOT_YET_RUN` |
| Account deletion/offboarding | owner and recent-auth verification, always-on suspension, ordered leased tasks, legal holds, retention/pseudonymization, immutable receipts, owned-location delete versus customer-location detach, provider ambiguity/reconciliation | `NOT_YET_RUN` |
| Support/SMS | atomic ticket/outbox, external exact-host gate, zero-communication sink, Twilio test/live boundary, monotonic receipts | `NOT_YET_RUN` |
| Security | route authority, client IP, Turnstile, consent suppression, strong-secret policy, release guard, centralized zero-external-effects evaluator | `NOT_YET_RUN` |
| Integrated database | exact 104 migrations fresh and history replay, foundation+extensions equality, ACL/RLS/default-ACL oracle, idempotency, atomic failure, forward recovery, zero residue | `NOT_YET_RUN` |
| Browser/accessibility | public cross-browser desktop/mobile, keyboard, skip links, reduced motion, 200% zoom, Axe, no console/page/request errors | `NOT_YET_RUN` |
| Safe load | centralized server attestation plus bounded loopback route load; no credentials, provider writes, or communications | `NOT_YET_RUN` |

The canonical runner is:

```bash
node scripts/run-dealflow-final-verification.mjs <external-round-directory> <round-number>
```

Rounds 1 and 2 must each pass with zero failures and must report identical seal
identity. Any source, migration, lockfile, configuration-contract, or test-runner
change after round 1 invalidates both rounds.

## Isolated hosted staging matrix

The staging broker and acceptance runner may begin only after the two exact-seal
rounds pass. Staging must remain isolated, synthetic, test-mode, no-spend, and
zero-communication.

| Staging proof | Required acceptance | Current result |
|---|---|---|
| Authority and identity | exact isolated Supabase fingerprint/suffix, exact Vercel project/host, exact sealed commit/tree, no production alias | `NOT_YET_RUN` |
| Database | empty-platform transactional 104-migration application or the pinned exact prior-103 read-only proof followed by atomic migration 104 plus its receipt; exact history; post-schema/ACL/RLS digest; idempotent replay | `NOT_YET_RUN` |
| Synthetic fixture | direct unpaid, direct paid, legacy reconciled, partner, partner-child, admin/operator, attacker/removed member, suspended/deletion lifecycle, failure/recovery records; deterministic exact counts | `NOT_YET_RUN` |
| Deployment | exact sealed build deployed only to the attested staging target; zero-external-effects endpoint proves every safety control | `NOT_YET_RUN` |
| Authenticated browser | direct/partner/admin/attacker journeys across desktop/mobile Chromium, Firefox, and WebKit; no skipped authenticated tests | `NOT_YET_RUN` |
| Golden journey | onboarding -> payment activation fixture -> GHL readiness -> campaign review -> explicit launch intent -> PAUSED truth -> results/support | `NOT_YET_RUN` |
| EN/FR/ES | public funnel, form, consent, metadata, thank-you, and Meta form configuration in all three languages | `NOT_YET_RUN` |
| GHL/Meta/provider boundaries | safely isolated test/sandbox paths only; exact kill switches; stale/duplicate/timeout/ambiguity/reconciliation cases | `NOT_YET_RUN` |
| Lead load/reliability | bounded synthetic no-write/public funnel load, canonical lead idempotency, repeated system jobs, zero old/stuck workers | `NOT_YET_RUN` |
| Evidence | machine-readable command/browser/provider ledgers, screenshots/traces on failure, manifest, checksums, zero-secret/customer-data scan | `NOT_YET_RUN` |

Hosted Playwright acceptance must fail when any authenticated test is skipped,
when the zero-external-effects preflight is absent, or when a request resolves
outside the exact staging host/project.

## Production release proof

Production remains `NO_GO` unless every item is present for the exact sealed and
staging-accepted candidate:

1. authoritative production schema inventory, backup and PITR evidence;
2. externally signed zero-old-worker/provider-protocol drain;
3. protected release trust and exact-deployment environment attestation;
4. owner-approved provider credentials, consent/policy, support destination,
   GHL lifecycle/offboarding, and optimizer rulebook;
5. pre-mutation read-only production preflight and additive forward plan;
6. separately authorized canary with monitoring and forward-recovery trigger;
7. post-release domain, schema, app, job, lead, billing, GHL, Meta, results,
   support, accessibility, error, and rollback/forward-recovery evidence; and
8. zero unresolved P0/P1 findings, warnings, secret leaks, customer-data leaks,
   skipped mandatory checks, or unexplained drift.

No live Meta ad, real communication, live Stripe charge, paid creative call, or
production provider/database mutation is claimed in this matrix.
