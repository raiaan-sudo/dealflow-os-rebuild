# DealFlow optimization policy

Policy ID: `dealflow-realtor-shadow-v1`
Mode: `SHADOW_ONLY`
Live provider action gate: default `false`
Overall release verdict: `NO_GO`

## Recovered canonical thresholds

These values are existing source behavior, not newly approved business policy:

| Key | Canonical value | Meaning |
|---|---:|---|
| `CTR_GOOD` | 2% | strong CTR marker |
| `CTR_KILL` | 0.5% | current cut threshold |
| `CPC_TARGET` | CAD 1 | strong CPC marker |
| `CPL_MAX` | CAD 50 | current maximum CPL marker |
| `CVR_TARGET` | 5% | landing-page conversion target |
| `FREQUENCY_MAX` | 4 | fatigue/cut marker |
| `NO_LEADS_TIMEOUT_HOURS` | 24 | no-lead elapsed marker |
| `SPEND_MULTIPLIER_KILL` | 2 | no-lead spend multiple |
| Hook refresh | 30 days | current refresh marker |
| Concept refresh | 2 underperforming weeks | current refresh marker |
| Higher-budget structure | CAD 100/day | current ABO+CBO structure threshold |

## Safety correction

The production baseline coerced some invalid/missing metrics to zero, making
missing CTR look like a cut signal and missing counters look calm. The candidate
policy corrects that behavior: missing, stale, partial, estimated, unavailable,
or conflicting data always yields `HOLD_NO_ACTION` and an immutable explanation.

Existing numerical rules may produce a shadow proposal only after all authority gates pass:

- Provider-confirmed metrics and source timestamps.
- Complete attribution/evaluation window.
- Explicit currency and unit normalization.
- Proven minimum spend/impressions/clicks/leads for the applicable rule.
- Customer-approved daily/lifetime budget ceiling.
- Learning/cooldown checks.
- Global, tenant, account and campaign kill switches all clear.
- Tenant-scoped lock and idempotency key.
- Current provider state matches the decision snapshot.

Minimum sample sizes, attribution windows, cooldown durations and scale caps are not authoritatively specified in the canonical product or owner ledger. They remain `BLOCKED_OWNER_APPROVAL`. Therefore this policy cannot emit an actionable scale/cut/pause/reallocation proposal; it emits `HOLD/NO_ACTION` with the missing gates until those values are versioned and approved.

## Immutable decision record

Every evaluation records:

- policy ID/version/digest
- tenant/campaign/account identifiers
- source/provider timestamps and freshness
- raw and normalized metrics with units/currency
- rule evaluations and missing authority gates
- proposed action and reasoning
- before state and authorized budget envelope
- idempotency key and lock/fence
- `simulated` result
- provider result only in a future separately authorized live run
- reconciliation and rollback status

Reallocation never increases total authorized spend. Any future rollback is
compare-and-swap and cannot overwrite a newer human/provider change. The
candidate records shadow decisions only; no provider action or spend mutation
was authorized or performed.
