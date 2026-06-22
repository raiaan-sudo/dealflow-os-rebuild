# Ops Monitoring V2 Runbook

## Scope

Ops Monitoring V2 is the safe operator layer for production health, durable debt, launch readiness, and proof-gate drift. It is designed for review and recovery, not for executing customer-impacting mutations.

## Daily Checks

Run:

```bash
npm run operator:ops-summary
npm run operator:debt
```

Review:

- `/admin/control-room`
- `/admin/incidents`
- `/admin/fulfillment-monitor`
- `/admin/launch-monitor`
- `/admin/issues`

## Safe Recovery Rules

Allowed from this layer:

- acknowledge reviewed `system_jobs` debt with an audit note
- acknowledge or resolve scale monitor incidents
- re-run read-only health checks
- link to proof reports and runbooks

Blocked from this layer:

- deleting failed or dead-letter jobs
- blind retry of external side-effect jobs
- GHL provisioning or workflow enrollment
- Meta campaign/ad/adset/creative mutation
- Stripe charges or checkout creation
- provider generation
- SMS/email sends

## Operator Debt

Unreviewed failed or dead-letter `system_jobs` rows remain visible until they are retried through a separately approved recovery path or acknowledged with `reviewed_at`, `reviewed_by`, and `resolution_note`.

The Control Room acknowledgement action only writes those review fields. It does not retry jobs, delete evidence, or call external systems.

## Gate Review

`operator:ops-summary` reports proof/live gate names and whether they are absent, true, or present-but-not-true from the current environment. It does not print secrets or encrypted values.

Critical gates that should remain off unless explicitly approved:

- `QA_AUTH_HARNESS_ENABLED`
- `STRIPE_TEST_HARNESS_ENABLED`
- `LEAD_CAPTURE_PROOF_HARNESS_ENABLED`
- `LEAD_SIDE_EFFECTS_CRM_PROOF_ENABLED`
- `PARTNER_CRM_SYNC_DRY_PROOF_ENABLED`
- `PARTNER_CRM_SYNC_LIVE_CONTACT_PROOF_ENABLED`
- `GHL_CONTACT_WRITES_ENABLED`
- `GHL_OPPORTUNITY_WRITES_ENABLED`
- `GHL_AUTO_PROVISIONING_ENABLED`
- `GHL_PROVISIONING_WRITES_ENABLED`
- `GHL_WORKFLOW_ENROLLMENT_ENABLED`
- `ALLOW_META_LIVE_LAUNCH`
- `PROVIDER_STATIC_GENERATION_PROOF_ENABLED`

## Escalation

If `operator:debt` fails after known proof residue is acknowledged, classify the remaining row before action:

- retry only if the job is idempotent and has no external side-effect risk
- acknowledge only if later proof shows the row is historical evidence
- leave unresolved and report as a blocker if the underlying bug is still active

Do not use Ops Monitoring V2 to bypass missing Meta business verification, live Stripe charge proof, provider video proof, or GHL provisioning proof.
