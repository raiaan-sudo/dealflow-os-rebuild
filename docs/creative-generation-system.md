# Creative Generation System

## Customer preview contract

Creative selection must always show a complete visual creative. Customers should never see a mostly blank gradient, raw provider state, rejected-image language, or a missing-background message as the primary experience.

When generated imagery is not available yet, failed, or withheld by quality checks, DealFlow renders an instant composed preview. That preview uses the same app-rendered headline, proof chips, CTA, category-specific layout, and media-buyer pattern that final generated imagery uses. Generated imagery may refresh in the background, but the customer can still inspect and choose the creative set immediately.

## Generated imagery contract

DealFlow supports two static creative modes:

- **DealFlow Composed Ad**: provider imagery is treated as a background asset only. It must not contain baked-in ad copy, fake captions, unreadable text, CTA buttons, or complete poster layouts. DealFlow owns the final copy, CTA, proof chips, and layout in deterministic UI code.
- **Marketing Studio Finished Ad**: Higgsfield Marketing Studio may render the final raster with text, branding, and layout. DealFlow must validate the raster with finished-ad QA before accepting it. Gibberish, misspelled brokerage text, fake UI, fake listing sheets, dashboards, charts, tables, or unsafe claims must be rejected before launch readiness.

If a generated image fails its selected mode contract or the quality gate, it can be stored for review but must not be treated as launch-ready. Launch and selection gates must keep using the static visual QA decision before saving or launching selected creatives.

Marketing Studio finished-ad rasters require `FINISHED_AD_VISION_QA_ENABLED=true` plus an OpenAI-compatible vision model configured by `FINISHED_AD_VISION_QA_MODEL` or `AI_VISION_MODEL`. If vision QA is unavailable, JPEG/PNG finished ads fail closed with `finished_ad_text_unverified`; SVG fixtures can still be inspected deterministically by the built-in text parser. Provider names and raw provider diagnostics remain internal.

The Higgsfield Marketing Studio CLI is allowed only through the explicit CLI provider path. Generic API mode must fail closed unless an official API endpoint/schema is verified. Vercel/serverless runtime support is not assumed; CLI generation should run only in a proven worker/operator runtime with bounded jobs and minimal allowlisted environment variables.

## Marketing Studio worker architecture

Marketing Studio finished-ad generation is intentionally split from the Vercel/internal system-job runner:

1. The app queues `static_creative_generation` jobs as usual.
2. If the approved creative intake has `outputMode: "finished_ad"` and `generationPhase: "static"`, the job is marked pending with `next_run_at=2099-01-01T00:00:00.000Z` and logged as deferred to `marketing_studio_cli_worker`.
3. Vercel `after()` kickoff and the internal `/api/internal/system-jobs` runner do not execute that job. This prevents serverless timeouts, unsupported CLI execution, and operator-debt failures.
4. A dedicated operator/worker process runs `npm run worker:marketing-studio -- --max-jobs=1` or `npm run worker:marketing-studio -- --poll --max-jobs=1 --interval-ms=30000`.
5. The worker performs readiness checks before claiming work:
   - `MARKETING_STUDIO_WORKER_ENABLED=true`
   - `MEDIA_GENERATION_PROVIDER=higgsfield_marketing_studio`
   - `ALLOW_HIGGSFIELD_IMAGE_GENERATION=true`
   - `HIGGSFIELD_MARKETING_STUDIO_ENABLED=true`
   - `HIGGSFIELD_MARKETING_STUDIO_MODE=cli`
   - `HIGGSFIELD_CLI_ENABLED=true`
   - executable `HIGGSFIELD_CLI_PATH`
   - `FINISHED_AD_VISION_QA_ENABLED=true`
   - `AI_API_KEY` or `OPENAI_API_KEY`
6. The worker claims only eligible Marketing Studio finished-ad static jobs, runs the existing generation pipeline, normalizes accepted provider output into app-owned `creative-assets` storage, runs finished-ad vision QA, and writes job status/result back through `system_jobs`.
7. The CLI child process receives only the Higgsfield allowlisted environment: `NODE_ENV`, `PATH`, `HOME`, `TMPDIR`, `HF_CREDENTIALS`, `HF_API_KEY`, `HF_API_SECRET`, `HIGGSFIELD_BASE_URL`, `HIGGSFIELD_CONFIG_HOME`, `HIGGSFIELD_CACHE_DIR`, `HIGGSFIELD_OUTPUT_DIR`, and `MARKETING_STUDIO_WORKER_OUTPUT_DIR`. It must not receive full `process.env`.

Use `npm run worker:marketing-studio -- --dry-run` for readiness and eligible-job proof. Do not run the worker with provider guards enabled against production until the owner has approved one capped live proof.

## Video review contract

AI UGC video concepts must be visible before render, selectable as a set, and playable when a video URL exists. Customer UI must not expose provider names, provider payloads, credentials, guard internals, or raw failure messages. Failed or unavailable video renders should present a retry-ready customer message.

## Regression checks

`npm run smoke:offline` must cover:

- instant composed previews exist when generated imagery is unavailable;
- generated background rejection copy stays customer-safe;
- carousel cards remain readable enough to inspect;
- full creative and full video review affordances exist;
- provider and internal generation jargon stays out of customer-facing creative selection.
