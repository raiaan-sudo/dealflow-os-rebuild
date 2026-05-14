# Marketing Studio CLI Proof Prompt

## Goal

Run a capped Higgsfield Marketing Studio CLI static or UGC proof through the dedicated worker.

## Safety Rules

- Do not run provider calls unless this prompt explicitly names the campaign, source asset, and max attempts.
- Use `npm run worker:marketing-studio -- --dry-run` first.
- Use `npm run worker:marketing-studio -- --max-jobs=1` for one capped attempt.
- No automatic retry.
- Do not process unrelated eligible jobs.
- Do not expose credentials.
- Do not deploy unless proof, browser proof, validation, and operator debt pass.

## Static Proof Requirements

- Preferred lane: Marketing Studio CLI finished-ad worker.
- Max accepted assets must be stated.
- App-owned `creative-assets` storage.
- Finished-ad QA/product-quality accepted.
- Selected launch set persists only accepted assets.

## UGC Proof Requirements

- Preferred lane: Marketing Studio CLI video worker.
- Source static asset must be accepted and app-owned.
- Persist campaign ID, creative ID, copy ID, prompt hash, script hash, source static asset, campaign context, provider job/result ID.
- Normalize MP4/WebM/QuickTime into app-owned `creative-assets`.
- Product-quality and deterministic provenance QA must accept.

## Fallback Policy

Keep Higgsfield API/SDK fallback available. Use fallback only when explicitly configured or when the prompt authorizes fallback proof.

## Final Report Format

- Worker readiness.
- Job ID.
- Provider usage event ID.
- Provider job/result ID.
- Asset IDs and storage paths.
- QA/provenance results.
- Spend status.
- Browser proof if passed.
- Deployment ID if deployed.
- GO/NO-GO.
