# Canonical Public Funnel Architecture

## Contract

Public `/f/[slug]` pages render only `CanonicalPublicFunnel` through `CanonicalPublicFunnelPage`.

The canonical public version is `dealflow-public-v1`. It is a fixed slot-based model with these slots:

- `hero`
- `trust`
- `offer`
- `value`
- `qualification`
- `expectations`
- `leadForm`

The public model does not expose arbitrary `sections`.

## Internal Drafts vs Public Output

Internal draft/history data can still contain `funnel.sections`. That data is used for editing, audit, and campaign history. It is not the public rendering contract.

Public rendering uses this order:

1. `getValidatedPublicFunnel(record)`
2. `buildCanonicalPublicFunnel(record)` fallback
3. `CanonicalPublicFunnelPage`

The public route must never map over `visibleSections`, `record.funnel.sections`, or arbitrary `section.type`.

## Banned Public Section Types

These legacy/internal section types are preserved internally but banned from direct public rendering:

- `faq`
- `process`
- `market_snapshot`
- `objections`
- `form`
- `closing_cta`
- `vsl`
- `image`

## Versioning Rules

Do not change `dealflow-public-v1` into a new shape in place.

Future template changes must follow this pattern:

1. Add `dealflow-public-v2`.
2. Add a dedicated v2 schema.
3. Keep the v1 renderer supported until every published v1 funnel is migrated.
4. Validate publish output against the matching version schema.
5. Dry-run any backfill before applying it.
6. Keep CI failing if the public route renders arbitrary sections again.

## Required Gates

Run these before releasing public funnel changes:

```bash
npm run guard:public-funnel
npm run test:canonical-public-funnel
npm run test:campaign-public-funnel-paths
npm run test:public-funnel-mobile
npm run test:lead-tracking-health
npm run routes:security
npm run smoke:offline
npm run lint
npm run typecheck -- --incremental false
npm run build
SUPABASE_SCHEMA_CHECK_MODE=local npm run schema:check
npm audit --audit-level=low
git diff --check
```
