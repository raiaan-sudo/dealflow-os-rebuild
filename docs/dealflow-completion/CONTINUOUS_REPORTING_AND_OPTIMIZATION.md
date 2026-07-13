# Continuous reporting and conservative optimization contract

## Implemented product contract

- Every provider-confirmed launched campaign receives one durable reporting schedule.
- The internal job runner creates one idempotent `meta_reporting_sync` job per due window.
- Jobs use the existing version-two token, generation, heartbeat, expiry, and `SKIP LOCKED` worker fence.
- Transient failures retry at 1, 2, 4, 8, then 15 minutes. A restart or duplicate worker cannot settle a superseded lease.
- Reporting freshness is `current`, `delayed`, `stale`, or `missing`. Stale/missing states create a durable, deduplicated operator alert. Success resolves it.
- Meta remains the advertising-metric system of record. DealFlow stores immutable observations and reconciliation status; it does not invent missing metrics.

## Provisional realtor optimization policy

Policy version: `dealflow-realtor-optimization-v2`.

- Evidence freshness: 60 minutes.
- Minimum data: 1,000 impressions, 20 clicks, and $50 spend.
- CPL action requires at least one lead. A zero-lead pause requires both 24 hours of observation and $100 spend, preventing an infinite/zero CPL from becoming a false signal.
- Recovered thresholds: CTR kill below 0.5%, CPL maximum $50, frequency maximum 4, strong CTR at 2%, CPC at or below $1, landing-page conversion at or above 5%.
- Attribution observation window: seven days.
- Provider mutation cooldown: 24 hours.
- Scaling: at most 20% per action and 20% total in any rolling 24-hour period.
- Scaling may never exceed the customer-approved daily budget ceiling.
- Global, account, campaign, and emergency kill switches all fail closed. Ambiguous evidence always produces `HOLD`.

The recovered policy is **provisional sandbox-only authority**. It enables deterministic shadow simulation, not a production provider mutation. Owner approval can replace thresholds through a new version; historical decisions keep their original policy digest.

## Sandbox executor

The Meta action executor accepts only `pause` and exact daily-budget actions. It requires an attested staging/preview/test target, explicit sandbox mode, explicit enablement, and an exact sandbox account ID. Production is unconditionally rejected.

Before a sandbox mutation it reads and compares the exact provider revision. After mutation it reads again. A mismatch triggers compare-and-swap rollback. Every accepted provider result is written as one immutable before/intended/after receipt under a deterministic idempotency key. A failed or ambiguous rollback is terminal operator work, never an automatic retry.

## Launch scheduling

Campaign launch intent is always 9:00 a.m. `America/New_York`, using daylight-saving-aware conversion:

- Before or exactly 9:00 a.m. Eastern: today at 9:00 a.m.
- After 9:00 a.m. Eastern: the next calendar day at 9:00 a.m.
- Saturday, Sunday, and holidays are not silently skipped. The next calendar day rule remains in effect until an owner explicitly approves a business-calendar policy.

## Owner-overridable assumptions

The owner may approve a new version for minimum data, thresholds, attribution window, reporting interval/freshness target, cooldown, scale cap, weekend/holiday behavior, or budget-ceiling source. No in-place policy rewrite is permitted. Production action remains disabled until a signed owner-approved version and a Meta sandbox acceptance portfolio exist.
