# DealFlow continuous reporting and optimization contract

Status: `INTEGRATED CANDIDATE / FINAL-SEAL PROOF NOT_YET_RUN / HOSTED META ACCEPTANCE NOT_YET_RUN`

## Continuous reporting

- Every exact provider-confirmed launched campaign has one durable reporting
  schedule and one idempotent sync job per due window.
- Jobs use token, generation, heartbeat, expiry and `SKIP LOCKED` fences.
- Duplicate windows/restarts cannot create parallel active authority; stale
  workers cannot settle newer leases.
- Transient reads use bounded retry/backoff. Ambiguous writes are never hidden
  as reporting success.
- Observations retain provider source time, attribution, units/currency and
  reconciliation state.
- Results distinguish `current`, `delayed`, `stale`, `missing`, `partial`,
  `unavailable` and `failed`; missing is never displayed as zero.
- Stale/missing states create a deduplicated operator alert and a later
  provider-confirmed success resolves it.

Repeated hosted sync, failure, restart, stale-worker, alert and recovery proof
for the exact staging deployment is `NOT_YET_RUN`.

## Optimization

Policy `dealflow-realtor-optimization-v2` is the only current candidate policy.
Its complete evidence, customer authority, exact Meta object/ACTIVE delivery,
budget, cooldown, scale, kill-switch, dispatch and reconciliation contract is in
`OPTIMIZATION_POLICY.md`.

The optimizer may never infer initial ad-spend authority, act on PAUSED-only
lineage, or treat a missing metric as zero. Application and database execution
gates default off. Hosted Meta sandbox action/reconciliation is `NOT_YET_RUN`;
production action remains `NO_GO`.

## Launch scheduling

Customer launch intent is scheduled for 9:00 a.m. `America/New_York` using
daylight-saving-aware conversion. At or before 9:00 a.m. Eastern it targets the
same day; after 9:00 a.m. it targets the next calendar day. Weekends and
holidays are not silently skipped without a later versioned owner decision.

No live provider action, ad delivery or spend is claimed by this document.
