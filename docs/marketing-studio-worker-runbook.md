# Marketing Studio Worker Runbook

## Purpose

The Marketing Studio worker runs Higgsfield CLI finished-ad generation outside Vercel/serverless. Vercel can queue and display job state, but the CLI path belongs in a long-running operator or worker runtime where binaries, auth, longer timeouts, local cache, and structured logs are controllable.

## Runtime

Recommended controlled-beta runtime:

- a dedicated operator machine or server worker;
- Node 20;
- the Higgsfield CLI installed and authenticated for the worker user;
- Supabase service-role access configured for job claim/writeback;
- no customer traffic handled by the worker;
- stdout collected as JSON lines by the process supervisor.

Do not run the CLI path inside Vercel functions unless a separate proof shows the CLI binary, auth, model listing, timeout window, and output handling are reliable in that runtime.

## Required environment names

Do not paste secret values into logs or tickets. Configure values through the host secret manager.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MARKETING_STUDIO_WORKER_ENABLED`
- `MEDIA_GENERATION_PROVIDER`
- `ALLOW_HIGGSFIELD_IMAGE_GENERATION`
- `HF_CREDENTIALS` or `HF_API_KEY` and `HF_API_SECRET`
- `HIGGSFIELD_BASE_URL`
- `HIGGSFIELD_IMAGE_MODEL`
- `HIGGSFIELD_MARKETING_STUDIO_ENABLED`
- `HIGGSFIELD_MARKETING_STUDIO_MODE`
- `HIGGSFIELD_CLI_ENABLED`
- `HIGGSFIELD_CLI_PATH`
- `HIGGSFIELD_CONFIG_HOME`
- `HIGGSFIELD_CACHE_DIR`
- `HIGGSFIELD_OUTPUT_DIR`
- `MARKETING_STUDIO_WORKER_OUTPUT_DIR`
- `STATIC_CREATIVE_PROVIDER_IMAGE_HOSTS`
- `FINISHED_AD_VISION_QA_ENABLED`
- `AI_API_KEY` or `OPENAI_API_KEY`
- `AI_BASE_URL` or `OPENAI_BASE_URL`
- `FINISHED_AD_VISION_QA_MODEL` or `AI_VISION_MODEL`
- Optional scoped QA credit proof only: `ALLOW_QA_GENERATION_CREDIT_OVERRIDE`,
  `QA_GENERATION_CREDIT_OVERRIDE_EMAILS`, and
  `QA_GENERATION_CREDIT_OVERRIDE_CAMPAIGN_IDS`

## Local commands

Readiness and eligible-job proof without generation:

```bash
npm run worker:marketing-studio -- --dry-run
```

Process one eligible job:

```bash
npm run worker:marketing-studio -- --max-jobs=1
```

Run as a polling worker:

```bash
npm run worker:marketing-studio -- --poll --max-jobs=1 --interval-ms=30000
```

## Job flow

1. The app creates a `system_jobs` row with `kind=static_creative_generation`.
2. If `payload.creativeIntake.outputMode` is `finished_ad` and `payload.creativeIntake.generationPhase` is `static`, the row is left `pending` and deferred with `next_run_at=2099-01-01T00:00:00.000Z`.
3. The Vercel route kickoff does not call `processSystemJob` for that payload.
4. The generic internal runner will not naturally claim the deferred job. If it ever receives one by ID, `processSystemJob` re-defers it instead of failing or dead-lettering.
5. The worker lists pending/expired Marketing Studio finished-ad jobs directly and processes only those payloads.
6. The existing static creative generation pipeline runs through the Marketing Studio provider, storage normalization, finished-ad QA, asset persistence, and job completion.

## Asset and QA contract

Marketing Studio finished-ad output is not launch-ready until all of these are true:

- provider output exists;
- the output is fetched from an approved provider CDN or read from an approved worker-local output directory, then copied into app-owned creative storage;
- `creative_assets.file_url` points at the durable app-owned asset;
- provider original URL remains metadata only;
- finished-ad vision QA is enabled and passes;
- static visual QA marks the asset launch-eligible;
- user selection points to a QA-accepted primary creative.

If vision QA is disabled, unavailable, or cannot inspect the JPEG/PNG/WebP, the finished ad fails closed and remains non-ready.

The Higgsfield CLI `generate create --wait` path returns result URLs rather than a separate generic asset-download command. If a future CLI version writes local files, the worker accepts only files under `MARKETING_STUDIO_WORKER_OUTPUT_DIR`, `HIGGSFIELD_OUTPUT_DIR`, `HIGGSFIELD_CACHE_DIR`, or the process temp directory. Remote provider URLs are fetched through the hardened static creative fetcher and must match `STATIC_CREATIVE_PROVIDER_IMAGE_HOSTS` or the built-in approved provider CDN hosts.

## Operator debt

Disabled/unready worker state must not create failed jobs or provider debt. The app queues eligible jobs as pending/deferred until the worker is ready. Real provider errors inside the worker should be recorded on the job and visible through `npm run operator:debt`; stale/test-safe records require operator review rather than deletion.

## Live proof gate

Before the first capped live proof:

1. `npm run worker:marketing-studio -- --dry-run` reports ready.
2. `higgsfield --version` succeeds in the worker runtime.
3. A safe model/capability command confirms `marketing_studio_image` without spending generation credits.
4. `FINISHED_AD_VISION_QA_ENABLED=true` and the vision provider are configured.
5. `npm run operator:debt` is clean.
6. Owner approves one capped QA campaign generation count.

If the scoped QA campaign has exhausted its generation-credit overdraft, use
the QA credit override only for the proof user and proof campaign. The override
must stay disabled by default, must list the exact QA/operator email, must list
the exact campaign id, and emits `qa_generation_credit_override_granted` for the
operator audit trail. Do not use this override for normal customer generation.

Do not use this worker for broad campaign retries until the capped proof has produced an app-owned, vision-QA-accepted finished ad and operator debt remains clean.
