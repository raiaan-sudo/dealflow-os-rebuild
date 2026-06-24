# GHL Workflow Enrollment Retirement - 2026-06-24

## Summary

Workflow enrollment has been retired from the active ClickToScale/DealFlow GHL fulfillment path.

Active GHL fulfillment now remains:
- contact sync
- opportunity sync
- operator-assisted / mapping-only provisioning readiness
- future sub-account provisioning proof path

Retired:
- automatic workflow enrollment
- workflow retry proof mode
- workflow config requirement for provisioning readiness
- active CRM sync calls to `addContactToWorkflow`

## Scope

Changed source:
- `src/lib/services/partner-crm-sync-service.ts`
- `src/lib/services/ghl-provisioning-service.ts`
- `src/lib/services/fulfillment-monitor-service.ts`
- `src/app/(app)/admin/fulfillment-monitor/page.tsx`
- `src/app/api/internal/partner-crm-sync-live-contact-proof/route.ts`
- `scripts/proof-ghl-provisioning-v1.mjs`
- `scripts/test-click-to-scale-ghl-adapted-schema.mjs`
- `scripts/check-route-security.mjs`

No schema migration was added.
No existing historical workflow table was deleted.
No production deployment was run.
No production DB mutation was run.
No live GHL call was run.

## Behavior After Change

`safeSyncLeadToPartnerCrm` no longer reads `partner_ghl_workflow_config` and no longer calls `addContactToWorkflow`.

CRM sync result metadata now reports:
- `workflow_enrollment: false`
- `workflow_reason: workflow_enrollment_retired`

The internal live CRM proof route no longer supports:
- `WORKFLOW_V1_PROOF_RUN_ID`
- `workflowRetry`
- workflow-specific QA lead creation
- direct workflow enrollment calls

The fulfillment monitor reports workflow enrollment as `retired`.

The provisioning readiness model no longer requires workflow config. It still validates the workspace mapping, partner config, location, pipeline, stage, and credential reference.

## Validation

Commands run:

```bash
npm run test:click-to-scale-ghl
source /Users/raiaanreza/.nvm/nvm.sh && nvm use 20.20.2 && npm run typecheck
source /Users/raiaanreza/.nvm/nvm.sh && nvm use 20.20.2 && npm run routes:security
source /Users/raiaanreza/.nvm/nvm.sh && nvm use 20.20.2 && npm run build
git diff --check
set -a && source "/Users/raiaanreza/Documents/New project/dealflow-release-candidate-20260617/.env.local" && set +a && npm run proof:ghl-provisioning-v1 -- --dry-run --no-live-read --proof-run-id=ghl_workflow_retirement_20260624_01
```

Results:
- `test:click-to-scale-ghl`: PASS
- `typecheck`: PASS
- `routes:security`: PASS
- `build`: PASS
- `git diff --check`: PASS
- `proof:ghl-provisioning-v1 --dry-run --no-live-read`: PASS

Dry-run proof result:
- `workflowEnrollmentRetired`: true
- `workflowConfigRequired`: false
- `mutationCount`: 0
- row deltas for GHL/provisioning/lead/system job tables: 0
- `noGhlWrites`: true
- `noContactWrite`: true
- `noOpportunityWrite`: true
- `noWorkflowEnrollment`: true
- `noProvisioningObjectCreation`: true
- `noSmsEmail`: true
- `noMeta`: true
- `noStripe`: true
- `noProvider`: true
- `tokensExposed`: false
- `credentialRefsExposed`: false

## Safety

No external side effects occurred:
- no GHL writes
- no workflow enrollment
- no provisioning
- no public lead submission
- no SMS/email
- no Meta mutation
- no Stripe/billing action
- no provider generation
- no deploy

## Remaining Notes

The GHL client still contains a low-level historical `addContactToWorkflow` helper. No active CRM sync, provisioning, fulfillment monitor, or live proof route calls it after this change.

The `partner_ghl_workflow_config` table remains in schema history for backward compatibility and auditability. Active readiness and sync logic no longer depends on it.

The working tree also has a pre-existing unrelated modification:
- `docs/launch-reports/MARTINE_OPTIMIZATION_DIAGNOSTIC_20260624.md`

That file was preserved and is not part of this retirement scope.

## Verdict

GHL workflow enrollment is retired from active fulfillment source paths. ClickToScale GHL fulfillment remains contact/opportunity-focused, with provisioning readiness still operator-assisted/mapping-only until agency-level automatic sub-account provisioning is separately proven.
