# Provider Proof Prompt

## Goal

Run one scoped capped provider proof for DealFlow media generation, with no broad retries and no unrelated campaign mutation.

## Safety Rules

- Provider calls only for the explicitly named campaign and asset.
- Max attempts must be stated before execution.
- No automatic retry.
- Do not run unrelated queued jobs.
- Do not expose secrets. Env var names only.
- Do not launch Meta ads, create Stripe charges, submit leads, send SMS/email, or mutate unrelated production data.
- Use Node 20.

## Allowed Actions

- Verify env gate names and readiness without printing values.
- Confirm source assets and campaign ownership.
- Confirm credit/provider usage guard can pass.
- Queue one scoped job if needed.
- Run one worker execution with `--max-jobs=1`.
- Read back job, provider event, asset, QA, and storage records.

## Prohibited Actions

- Broad worker runs.
- Retry loops.
- SDK fallback calls unless the prompt explicitly authorizes fallback proof.
- Provider generation outside the named proof.

## Required Validation

- `npm run operator:debt` before and after.
- Worker dry-run before execution.
- Focused provider selection and safety tests when code changed.

## Final Report Format

- Campaign ID.
- System job ID.
- Provider usage event ID.
- Provider job/result ID.
- Asset ID and storage path.
- Prompt/script/source/provenance proof.
- QA/product-quality result.
- Whether spend occurred.
- API/SDK fallback status.
- GO/NO-GO.
