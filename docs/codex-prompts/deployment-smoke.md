# Deployment Smoke Prompt

## Goal

Deploy only validated safe changes, verify aliases, and run safe production smoke without business side effects.

## Safety Rules

- Do not deploy unvalidated code.
- Do not deploy from a dirty checkout unless using a clean worktree pinned to the intended commit.
- Do not submit real leads, create Stripe charges, send SMS/email, launch Meta ads, or trigger provider generation.
- Use read-only GET checks and intentionally invalid/unsigned POST probes only.

## Required Pre-Deploy Checks

- `git status --short`
- `node -v`
- `npm run operator:debt`
- `npm run routes:security`
- `npm run smoke:offline`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- diff secret-pattern scan

## Required Production Checks

- Deployment ID and ready state.
- `https://app.agentdealflow.io`
- `https://agentdealflow.io`
- `https://www.agentdealflow.io`
- Safe GET endpoints from `docs/production-proof-checklist.md`.
- Invalid/unsigned POST probes.
- CSP, HSTS, X-Frame-Options, nosniff, referrer policy.

## Final Report Format

- Commit deployed.
- Deployment ID.
- Alias mapping.
- Smoke table.
- Security headers.
- GO/NO-GO.
