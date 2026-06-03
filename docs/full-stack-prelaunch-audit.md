# DealFlow Full-Stack Prelaunch Audit Stack

This repo includes a layered audit stack for prelaunch checks across code, security, UI, production smoke, partner branding, billing, and creative readiness.

## Local Safe Audit

```bash
npm run audit:full-stack
```

Default behavior is local and non-mutating. It does not launch campaigns, mutate Meta, open Stripe Checkout, send SMS/email, create Freshdesk tickets, publish funnels, run provider generation, or alter production data.

The local audit now includes a security coverage matrix and maps these launch-risk areas:

- cross-client data isolation and IDOR/BOLA object swapping
- Supabase RLS and storage proof
- authenticated browser UX and RBAC flows
- mass-assignment protection for server-owned fields
- creative/funnel/media storage provenance
- security headers, CSP, and cookie posture
- webhook signature, replay, and idempotency attacks
- DAST scanning through ZAP
- secrets in source, build, and deploy surfaces
- logging, support, telemetry, and PII redaction
- supply-chain hardening
- backup, restore, and incident response readiness
- partner/white-label data isolation
- production canary proof

## Production Read-Only Audit

```bash
FULL_STACK_AUDIT_PRODUCTION=1 PRELAUNCH_BASE_URL=https://app.agentdealflow.io npm run audit:full-stack
```

Adds operator and postdeploy checks.

## Strict Launch Audit

```bash
FULL_STACK_AUDIT_STRICT=1 \
FULL_STACK_AUDIT_EXTERNAL=1 \
FULL_STACK_AUDIT_PRODUCTION=1 \
PRELAUNCH_BASE_URL=https://app.agentdealflow.io \
npm run audit:full-stack
```

Strict mode adds authenticated browser proof and live cross-tenant RLS proof. Those checks may create temporary QA fixtures and must only run in an approved safe environment.

Strict production/data-isolation mode requires these local env values to be non-empty:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Use the Vercel CLI through `npx` if it is not globally installed:

```bash
npx vercel env pull .env.production.local --environment=production --yes
```

If Vercel writes blank values for encrypted secrets, the strict audit will fail fast before running build/test commands. Load the values from a secure shell or dashboard export without pasting secrets into chat, then rerun the strict command.

## External Scanner Audit

```bash
FULL_STACK_AUDIT_EXTERNAL=1 npm run audit:full-stack
```

Adds Semgrep and Lighthouse. ZAP also runs when `ZAP_TARGET_URL` or `PRELAUNCH_BASE_URL` is set.

## Individual Tools

```bash
npm run audit:semgrep
npm run audit:lighthouse
ZAP_TARGET_URL=https://app.agentdealflow.io npm run audit:zap:baseline
```

## GitHub Automation

`.github/workflows/security-audit.yml` runs:

- CodeQL JavaScript/TypeScript security and quality queries.
- Semgrep custom DealFlow rules.
- Lighthouse CI.
- OWASP ZAP baseline only by manual workflow dispatch.

## Custom DealFlow Guardrails

`.semgrep.yml` includes rules for:

- service-role/admin client leakage into client-rendered surfaces
- provider/private/signed URL rendering in customer UI
- private mutation route same-origin guard coverage
- live launch bypass patterns
- raw secret debug output

These rules are intentionally conservative. Treat warnings as review prompts and errors as blockers until triaged.
