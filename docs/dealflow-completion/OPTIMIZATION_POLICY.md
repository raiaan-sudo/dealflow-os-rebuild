# DealFlow Meta optimization policy

Policy version: `dealflow-realtor-optimization-v2`
Candidate mode: `DEFAULT_OFF / SHADOW OR EXPLICITLY GATED EXECUTION ONLY`
Final-seal proof: `NOT_YET_RUN`
Hosted Meta sandbox acceptance: `NOT_YET_RUN`
Production action: `NO_GO`

The earlier `dealflow-realtor-shadow-v1` document state is superseded for the
integrated candidate. Historical v1 decisions remain immutable under their
original policy digest; they do not authorize v2 execution.

## Fixed v2 evidence and action contract

| Gate | v2 contract |
|---|---|
| Evidence freshness | at most 60 minutes |
| Minimum impressions | 1,000 |
| Minimum clicks | 20 |
| Minimum spend | `$50` in the approved USD/CAD currency |
| CPL action | at least one lead; no-lead pause additionally requires 24 hours and `$100` spend |
| Attribution window | seven days |
| Cooldown | 24 hours after the last provider mutation |
| Scale step | at most 20% in one action |
| Rolling scale | at most 20% total in 24 hours |
| Budget ceiling | never above the customer-authorized daily ceiling |
| Kill switches | global, account, campaign and emergency must all be clear |

Recovered performance thresholds used only after every evidence/authority gate:

| Metric | Threshold |
|---|---:|
| Strong CTR | `>= 2%` |
| CTR pause | `< 0.5%` |
| Strong CPC | `<= $1` |
| CPL maximum | `> $50` pauses when minimum evidence is satisfied |
| Landing-page conversion target | `>= 5%` |
| Frequency maximum | `> 4` pauses |

Missing, stale, partial, estimated, unavailable, invalid or conflicting data
always yields `HOLD_NO_ACTION`. Numeric zero is accepted only as an actual
provider-confirmed metric, never as a substitute for missing evidence.

## Customer and object authority

Execution requires one active, finalized authorization bound to the exact:

- organization, customer user and campaign;
- approved USD/CAD currency and daily budget ceiling;
- Meta account, launched provider campaign, ad set and single-primary ad;
- immutable launch input and provider receipt lineage;
- current qualifying entitlement and effective ACTIVE delivery;
- current policy version/digest and customer authorization timestamp; and
- current execution control state.

Revoked, superseded, ambiguous or operator-required authorization cannot act.
The optimizer cannot create initial spend authority or activate a PAUSED
campaign; it acts only on the exact already customer-authorized ACTIVE lineage.

## Durable execution saga

For each decision/action, DealFlow must:

1. claim one renewable job/decision lease;
2. read complete provider evidence and current policy/control rows;
3. bind the exact launch and single-primary object receipts;
4. re-read provider hierarchy, effective ACTIVE state, currency and budget;
5. revalidate lease/generation, customer authorization, entitlement, kill
   switches, cooldown, rolling scale and budget ceiling;
6. arm one immutable one-use dispatch nonce immediately before the write;
7. issue one no-retry provider write;
8. persist the matching receipt and provider readback; and
9. reconcile or enter `operator_action_required` on any possible-write
   ambiguity, expired armed effect, mismatched hierarchy, or failed rollback.

An expired lease may not settle or release a possible provider effect. A budget
increase may not settle unless the exact provider hierarchy remains effectively
ACTIVE. Reconciliation must never overwrite a newer human/provider change.

## Decision record

Every evaluation retains the policy version/digest, tenant/campaign/account and
object IDs, source/provider timestamps, normalized metrics and units/currency,
all evaluated gates, action/reason, before/intended/after state, budget envelope,
lease/generation/dispatch identities, provider receipt, reconciliation and
terminal state. Provider credentials and customer PII are excluded.

## Environment gates

Application and database controls default off. Staging and production each
require their own exact host, Vercel environment, Supabase project, Meta account,
provider mode, global/operation flags and database runtime switches. A local
mock, `NODE_ENV`, policy row or customer click cannot replace those gates.

Production additionally requires a signed owner-approved policy version,
protected exact-deployment/environment/drain evidence, successful isolated Meta
sandbox action/reconciliation proof, controlled canary, monitoring and stop
plan. None is currently proven.

No live Meta action or advertising spend is claimed by this policy document.
