# Post-Launch Hardening Prompt

## Goal

Improve DealFlow reliability, security, supportability, and observability after launch without disrupting proven production flows.

## Safety Rules

- No provider generation.
- No billing, Meta, SMS/email, or lead side effects.
- No destructive DB changes.
- Preserve unrelated dirty files.
- Use Node 20.

## Candidate Areas

- CSP `unsafe-inline` migration.
- Signed/private media proxy.
- Legacy failed asset cleanup.
- Provider monitoring.
- Stripe and Meta runbook automation.
- Weekly `operator:debt` monitor.
- GitHub issue/PR workflow.
- Support/cancellation polish.
- Funnel copy polish.

## Required Validation

- Focused tests for changed area.
- Core validation from `docs/validation-runbook.md`.
- Production smoke only when deployed.

## Final Report Format

- Hardening item.
- Risk reduced.
- Files changed.
- Validation.
- Remaining backlog.
