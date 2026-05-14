# Focused Remediation Prompt

## Goal

Fix one named DealFlow defect with the smallest safe patch, prove it locally, and avoid unrelated churn.

## Safety Rules

- Preserve unrelated dirty files.
- Do not trigger provider generation unless this prompt explicitly authorizes a capped proof.
- Do not launch Meta ads, create Stripe charges, submit leads, send SMS/email, expose secrets, or mutate unrelated production data.
- Use Node 20.

## Allowed Actions

- Inspect relevant code, tests, docs, and DB records.
- Patch focused files.
- Add regression tests for the defect.
- Run focused validation plus any required project checks.

## Prohibited Actions

- Broad rewrites.
- Unrequested UX redesigns.
- Destructive git commands.
- Deploying unless the user explicitly asks and validation passes.

## Required Validation

- Focused test for the changed behavior.
- `npm run lint`
- `npm run typecheck`
- `npm run build` when runtime code changed.
- `git diff --check`
- diff secret-pattern scan.

## Final Report Format

- Final Verdict.
- Root cause.
- Files changed.
- Tests/commands run.
- Product behavior changed or preserved.
- Remaining technical blockers.
- Owner/manual gaps if relevant.
- GO/NO-GO if readiness was requested.
