# Creative Media Readiness Prompt

## Goal

Verify DealFlow static and UGC media readiness across DB truth, storage, QA/provenance, Build, Preview, and Launch.

## Safety Rules

- Do not trigger generation.
- Do not mutate campaign media state unless explicitly requested.
- Do not expose provider original URLs to customer surfaces.
- Do not expose secrets.
- Preserve unrelated dirty files.

## Required Checks

- Selected static IDs are persisted and launch-ready.
- Static assets are app-owned under `creative-assets`.
- Static QA/product-quality accepted.
- UGC video asset is app-owned under `creative-assets`.
- Video metadata includes prompt hash, script hash, source static asset, source accepted flag, campaign context, provider job/result ID, and QA gates.
- Generic, sample, reused, or review-only video is not launch-ready.
- Build / Preview / Launch agree.
- No Download / Export / Copy URL / Open original actions.

## Required Validation

- `npm run test:creative-media-readiness`
- `npm run test:static-creative-storage`
- `npm run test:static-creative-image-qa`
- `npm run test:static-ad-templates`
- `npm run test:video-generation-safety`
- `npm run operator:debt`

## Final Report Format

- Static readiness percentage.
- UGC readiness percentage.
- Build / Preview / Launch agreement.
- Asset IDs and storage paths.
- QA/provenance status.
- Technical blockers.
- Owner/manual gaps.
