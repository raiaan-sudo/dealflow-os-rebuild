# Full Production Audit Prompt

## Goal

Audit DealFlow OS end to end for production readiness without creating real-world side effects. Verify code, DB truth where needed, local validation, authenticated browser state, production deployment state, aliases, and safe smoke checks.

## Safety Rules

- Do not launch Meta ads.
- Do not create Stripe charges, checkout sessions, refunds, or billing mutations.
- Do not submit leads.
- Do not send SMS or email.
- Do not expose secrets. Env var names only.
- Do not mutate production DB data unless explicitly requested.
- Do not trigger provider generation.
- Preserve unrelated dirty files.
- Use Node 20.

## Allowed Actions

- Read code, docs, schema, and DB state needed to verify claims.
- Run safe local validation commands.
- Run authenticated browser proof using approved QA harnesses.
- Run safe production GET probes and intentionally invalid/unsigned POST probes.
- Inspect deployment IDs and aliases.

## Prohibited Actions

- Broad remediation without owner request.
- Provider retries or creative generation.
- Live launch or billing side effects.
- Destructive git or DB operations.

## Required Validation

- `node -v`
- `npm run operator:debt`
- `npm run routes:security`
- `npm run smoke:offline`
- `npm run schema:check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm audit --omit=dev --audit-level=high`
- `git diff --check`
- diff secret-pattern scan

Add focused suites for changed areas.

## Required Proof

- Confirm live deployment ID and aliases.
- Verify accepted funnel slug `/f/raiaan-broker-toronto-on-ccbfbfce`.
- Run authenticated browser proof for Build / Preview / Launch when media or launch readiness is in scope.
- Confirm operator debt is clean before readiness claims.

## Blocker Classification

Separate technical blockers from owner/manual gaps. Owner/manual gaps include Stripe checkout acceptance, Meta account/Page/pixel/domain acceptance, final owner walkthrough, and final launch approval.

## Final Report Format

Use `docs/codex-prompts/final-report-template.md`. Include percentage readiness scores and GO/NO-GO.
