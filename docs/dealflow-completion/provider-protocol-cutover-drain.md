# Provider protocol cutover drain (mandatory)

Status: `NOT EXECUTED / NO AUTHORITATIVE DRAIN EVIDENCE / NO_GO`

This runbook is a release gate, not authorization to deploy, migrate, enable a
provider, send a communication, or mutate production.

Candidate protocols replace broad/direct mutation with versioned token,
generation, expiry, heartbeat, immutable identity/digest, append-only receipt,
and compare-and-swap settlement. Schema privileges can stop an old worker from
starting a new write after cutover, but cannot recall a provider request that
already passed its last database fence.

## Protocols in the drain boundary

| Provider/effect class | Superseded risk | Candidate boundary |
|---|---|---|
| Meta launch/CAPI | old launch/effect worker can issue a late request or combine mutable retry inputs | v2 claim, immutable launch-input digest, lineage-bound receipts, consent/effect fences |
| GHL provisioning/lead effects | old outbox worker can duplicate location/contact/opportunity work | fake-only current candidate; future real path must use token/generation claim and provider idempotency/receipt reconciliation |
| Twilio SMS/compliance | old delivery path can bypass monotonic receipt or atomic STOP/START state | SMS v2 create/callback/settlement and direct-DML denial |
| Stripe billing/provider usage/access activation | old webhook/usage worker can project stale state, mix mode, or compensate twice | v2 webhook claim, authoritative refresh, atomic projection, provider-usage CAS, durable top-up/access intents |
| Creative generation/storage | old worker can spend/retry under stale org/asset/provider identity | exact org/campaign attempt, immutable storage identity, provider-usage attempt, bounded terminalization |

The release guard's mandatory old-worker classes are:

- `campaign_plan_v0_writers`
- `meta_launch_v0_workers`
- `sms_delivery_v0_workers`
- `stripe_webhook_v1_workers`
- `system_job_v1_workers`

## Required cutover sequence

1. Separately review and authorize backward-compatible drain code.
2. Stop new dispatch to every superseded class while allowing already-owned work
   to settle or enter a durable terminal/operator state.
3. Keep every live provider/communication/spend gate off.
4. Query authoritative platform/runtime state for the exact old and target
   deployment identities; do not infer zero from logs or elapsed time.
5. Generate one fresh `dealflow.release-evidence.v2` drain manifest with exactly
   the five required classes and active count `0` for each.
6. Bind provider/project/deployment, target commit, source workflow/run, and
   completion time. Sign the canonical payload with an Ed25519 authority pinned
   only in the protected external policy whose path/digest are independently
   supplied by the out-of-band runner. Target-added keys are ignored.
7. Generate the separately signed environment attestation for the same exact
   deployment. Any mismatch is `NO_GO`.
8. Apply contract migrations only after both attestations verify.
9. Deploy only the exact v2 candidate, then run schema/RLS/privilege,
   claim/heartbeat/settlement, stale-generation, ambiguity, direct-DML, and
   provider-gate negatives.
10. Provider canary/enablement remains a later separate authorization.

Missing class, unsigned/self-signed evidence, stale target/time, wrong source,
wrong deployment, nonzero count, unconfigured authority, or absent environment
attestation stops the release.

## Failure/recovery

If old work appears after the contract boundary, stop new v2 dispatch and treat
it as an incident. Do not re-enable an incompatible old application against the
contracted schema. Preserve receipts/claims/ledger evidence and use a reviewed
forward application fix or additive forward-recovery migration.

No worker drain, provider quiescence check, migration, or production cutover was
performed in this audit.
