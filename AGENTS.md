# AGENTS.md - DealFlow OS Codex Operating System

This file is the repo-level contract for Codex agents working in DealFlow OS. Follow it before any task-specific prompt unless the user explicitly overrides it.

## Product Baseline

- Product: DealFlow OS, a SaaS for dealflow, prospecting, pipeline, and marketing automation.
- Current media/provider baseline: Higgsfield Marketing Studio CLI static and UGC proof passed on production deployment `dpl_6BGWKUEAA2dztj21EUbnhH9cv8TK`.
- Preferred premium static path: Higgsfield Marketing Studio CLI finished-ad generation through the dedicated worker.
- Preferred premium UGC path: Higgsfield Marketing Studio CLI video generation through the dedicated worker when `HIGGSFIELD_UGC_VIDEO_MODEL=marketing_studio_video`.
- Safe fallback: existing Higgsfield API/SDK path remains available and must not be removed.
- Accepted production funnel slug for current proof campaign: `/f/raiaan-broker-toronto-on-ccbfbfce`.
- `/f/raiaan-realty` is not a blocker unless the owner explicitly reclassifies it.
- Pricing contract: Starter `$147/mo`, Pro `$297/mo`.

## Runtime And Commands

- Use Node 20. Verify with `node -v` or `source ~/.nvm/nvm.sh && nvm use 20.20.2`.
- Do not invent scripts. Inspect `package.json` before running commands.
- Common validation entrypoints:
  - `npm run operator:debt`
  - `npm run routes:security`
  - `npm run smoke:offline`
  - `npm run schema:check`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run launch:validate` prints the recommended safe validation sequence.

## Dirty Worktree And Git Safety

- Preserve unrelated dirty files. Do not overwrite, stage, commit, or format files you did not intentionally change.
- Inspect `git status --short` before edits and before final reporting.
- Never run destructive git commands such as `git reset --hard`, `git checkout --`, or broad cleanups unless the user explicitly asks.
- If committing, stage only files changed for the current task.
- If deploying from a dirty checkout, use a clean worktree pinned to the intended commit.

## Non-Negotiable Safety Rules

- Never expose secrets, tokens, private keys, API keys, OAuth codes, cookies, service-role values, or customer PII.
- Refer to environment variable names only, never values.
- Do not create Stripe charges, checkout sessions, refunds, or billing mutations unless the user explicitly asks for that exact proof.
- Do not launch Meta ads or create live Meta campaigns. Launch payloads must remain paused unless owner explicitly approves live launch work.
- Do not submit real leads.
- Do not send SMS or email.
- Do not mutate production DB data during audits or workflow-hardening work.
- Do not trigger Higgsfield, OpenAI, or other provider generation except for an explicitly scoped capped proof with a stated campaign, attempt limit, and no broad retries.
- Do not run broad provider retries.

## Provider Proof Rules

- CLI media jobs must not run inside Vercel/serverless request lifecycles.
- Marketing Studio CLI jobs must be owned by the dedicated worker.
- Serverless routes may enqueue eligible jobs but must not process CLI media jobs.
- Worker dry-run must be ready before a capped proof.
- Confirm no unrelated eligible worker jobs before a proof.
- Use `--max-jobs=1` for capped worker proofs unless the user explicitly authorizes more.
- If a proof fails, stop. Do not retry unless the user explicitly authorizes another attempt.
- A proof is not launch-ready until DB truth, app-owned storage, provider usage, QA/provenance, and UI readiness agree.

## Creative Media Readiness Rules

- Static creative readiness requires selected static assets, app-owned `creative-assets` storage, storage normalization, and accepted QA/product-quality gates.
- Marketing Studio finished-ad rasters require finished-ad QA. Reject gibberish, fake dashboards, fake UI, fake listing sheets, tiny unreadable text, cropped CTA, unsafe claims, and invented logos.
- UGC video readiness requires app-owned MP4/WebM/QuickTime storage, `storageNormalized=true`, prompt hash, script hash, source static asset, campaign context, provider job/result ID, deterministic provenance QA, and product-quality acceptance.
- Generic, reused, placeholder, or sample videos must not be marked launch-ready.
- Customer media surfaces must not expose Download, Export, Copy URL, Open original, or raw provider file actions.

## Proof Standards

- Local proof is not enough when the claim is about production readiness.
- Authenticated production browser proof beats local proof.
- Required launch/media proof should include:
  - DB truth for campaign, selected static assets, video asset, provider event, and storage paths.
  - Local validation.
  - Authenticated browser proof when UI readiness is claimed.
  - Production deployment ID when deployment is claimed.
  - Alias verification for `https://app.agentdealflow.io`, `https://agentdealflow.io`, and `https://www.agentdealflow.io`.
  - Safe production smoke checks.
  - `npm run operator:debt` clean before any launch-ready or beta-ready claim.
  - Build / Preview / Launch agreement for static and UGC media readiness.

## Safe Production Smoke Rules

Allowed production checks:

- Read-only GET requests.
- Intentionally invalid or unsigned POST probes only.
- Header inspection.

Forbidden production checks:

- Real lead submissions.
- Stripe checkout/payment creation.
- SMS/email sends.
- Meta launch or campaign creation.
- Provider generation.
- Production DB writes unless explicitly requested.

Expected safe smoke endpoints:

- `GET /`
- `GET /login`
- `GET /privacy`
- `GET /terms`
- `GET /data-deletion`
- `GET /dashboard` unauthenticated redirect
- `GET /f/raiaan-broker-toronto-on-ccbfbfce`
- `GET /robots.txt`
- `GET /sitemap.xml`
- `GET /opengraph-image`
- invalid `POST /api/lead-capture`
- unsigned `POST /api/stripe/webhook`
- unsigned `POST /api/webhooks/twilio/status`
- unauthenticated `/api/internal/system-jobs`

## Owner/Manual Versus Technical Blockers

Do not classify owner-managed business acceptance as a technical defect. Separate:

- Technical blockers: broken app behavior, failed validation, failed proof, failed deployment, security regression, operator debt, storage/QA mismatch, route/API failure.
- Owner/manual gaps: Stripe checkout acceptance, Meta account/Page/pixel/domain acceptance, final owner walkthrough, and final launch approval.

## Final Report Requirements

Every meaningful final report must include:

- Final Verdict.
- Percentage readiness scorecard.
- Changed files.
- Commands run and pass/fail/skipped reason.
- Production proof when relevant.
- Browser proof when relevant.
- Deployment ID when deployed.
- Remaining technical blockers.
- Owner/manual gaps.
- Risks/notes.
- GO/NO-GO for controlled beta and public self-serve when launch readiness is discussed.

Use the reusable templates in `docs/codex-prompts/` and the runbooks in `docs/validation-runbook.md` and `docs/production-proof-checklist.md`.
