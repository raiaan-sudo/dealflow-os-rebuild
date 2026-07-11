# DealFlow completion baseline manifest

Status: `CANONICAL_CORE_PROVEN`
Evidence cut: `2026-07-11T02:28:37Z`
Implementation root: `/Users/raiaanreza/.codex/worktrees/dealflow-completion-20260710`

## Canonical core chain

The core source gate passed through independent read-only signals:

```text
agentdealflow.io / app.agentdealflow.io / www.agentdealflow.io
clicktoscale.io / www.clicktoscale.io
  -> Vercel project dealflow-os-rebuild
  -> production deployment dpl_J4Ksu4n7sjwdRv8tHBTa5ARDKg9E
  -> verified GitHub repository raiaan-sudo/dealflow-os-rebuild
  -> remote main
  -> commit d37c50945ff7004d700301fc89c15eb9273dac5b
  -> tree 1b641a447509dbcae6ca1c23b63520ebdb63c931
  -> isolated clean branch codex/dealflow-completion-20260710
```

Mechanical checks at baseline:

- `git rev-parse HEAD`: `d37c50945ff7004d700301fc89c15eb9273dac5b`
- `git rev-parse HEAD^{tree}`: `1b641a447509dbcae6ca1c23b63520ebdb63c931`
- `git merge-base --is-ancestor d37c509... HEAD`: exit `0`
- Git state: clean; no stash; no upstream; no local Vercel link.
- Remote `main` matched the deployment source SHA at evidence time.
- Original candidate worktrees were not reset, cleaned, rebased, overwritten, or used as a source merge.

## Surface matrix

| Surface | Host/project | Runtime deployment | Source mapping | Gate/disposition |
|---|---|---|---|---|
| `agentdealflow.io` | Vercel / `dealflow-os-rebuild` | `dpl_J4Ksu4n7sjwdRv8tHBTa5ARDKg9E` | `main` at `d37c509...` | `CANONICAL_CORE_PROVEN` |
| `app.agentdealflow.io` | Vercel / `dealflow-os-rebuild` | same deployment | same source | `CANONICAL_CORE_PROVEN` |
| `www.agentdealflow.io` | Vercel / `dealflow-os-rebuild` | same deployment | same source | `CANONICAL_CORE_PROVEN` |
| `clicktoscale.io` | Vercel / `dealflow-os-rebuild` | same deployment | canonical proxy includes host | `CANONICAL_CORE_PROVEN` |
| `www.clicktoscale.io` | Vercel / `dealflow-os-rebuild` | same deployment | canonical proxy includes host | `CANONICAL_CORE_PROVEN` |
| In-app `/onboarding`, `/paywall` | same core project | same deployment | routes in exact tree | source proven; authenticated runtime not exercised |
| `internal.agentdealflow.io` | independently deployed Vercel surface | live deployment/source SHA unavailable | local candidate has no remote and dirty evidence | `BLOCKED_EXTERNAL`; no edits permitted |
| `clicktoscale.agentdealflow.io` | Cloudflare/Lovable-style surface | public deployment hash only | no repository/commit mapping | `BLOCKED_EXTERNAL`; no edits permitted |
| `onboarding.agentdealflow.io` | Cloudflare/Lovable-style surface | public deployment hash only | no repository/commit mapping | `BLOCKED_EXTERNAL`; no edits permitted |

The Cloudflare/Lovable public hashes are retained in `baseline-manifest.json`; they prove runtime identity, not source ancestry.

## Immutable source and build inputs

| Item | Baseline value |
|---|---|
| Package SHA-256 | `5ad5b0f60b9347768afa8f45ebfe6e4bd28724dceb4569ecf200e9def3c3c813` |
| Lockfile SHA-256 | `9608ce486191fe804a9d22dfddcd8e5c26976526557effb71403d92c6e28d544` |
| Vercel config SHA-256 | `cefc6323673adae48da69d2de3b6292153a0bcd5123c34b032a6407f3a3282ba` |
| CI workflow SHA-256 | `d7fcd1596d7172f7e71378f9c8b4316092955c211cfb19f38083a9c94cf8c41c` |
| Migration-set digest | `2c2793067eec0e8972f9e1cc31e3635976b74c907114f17cc72b5780b0e50ebc` |
| Route-source digest | `fe67b91ad9a6836eb3295b8b72068d2629e44a11e8897a8f38a29e56f36eaa46` |
| Framework | Next.js `16.2.10`, React `19.2.4` |
| Runtime contract | Node `>=20 <25`; CI and production metadata select Node 24 |
| Tracked source | 467 files at the verified tree |
| Routes | 30 page files, 49 `/api` route files, 2 metadata route files |
| Migrations | 33 files |
| Migration head | `20260706170000_create_lead_tracking_health.sql` |
| Migration-head SHA-256 | `a39ff515dcd96d68d50b4bc534651983e5bb6995c228d4662111a533f9abba82` |
| Scheduled worker | `GET/POST /api/internal/system-jobs`; Vercel cron `*/1 * * * *` |

Canonical build commands are `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run smoke:offline`, `npm run test:production-route-contract`, and `npm run routes:security`.

## Baseline validation truth

The fully materialized, non-iCloud checkout passed:

- `npm ci`: 426 packages installed; audit reported zero vulnerabilities.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass; 47 static pages generated; 30 application page files and 49 API route files present.
- All registered offline/static regression scripts executed so far: pass.
- `node scripts/test-internal-sms-notifications.mjs`: baseline failure because the unregistered legacy test expects removed `ALLOW_PUBLIC_LEAD_NO_TURNSTILE` source. This is retained as a baseline test-maintenance defect, not relabeled as green.
- Remote schema/RLS/operator checks were not run: they require a real service-role connection and are not hermetic.

An earlier build attempt inside the iCloud-backed Documents clone hung during page-data collection because macOS had evicted tracked files to placeholders. The identical commit built successfully outside iCloud. That first checkout remains preserved and is not an execution source.

## Protected visual baseline

The following read-only screenshots were captured without form submission, authentication, or provider action:

- `evidence/visual-baseline/live/agentdealflow-root-1440x900.png`
- `evidence/visual-baseline/live/agentdealflow-login-390x844.png`
- `evidence/visual-baseline/live/clicktoscale-subdomain-1440x900-full.png`
- `evidence/visual-baseline/live/onboarding-subdomain-1440x900-full.png`

Observed core anonymous behavior: the apex entered `/onboarding` and redirected to `/login?reason=expired&redirectedFrom=%2Fonboarding`. The rendered login document had an empty document title, no skip link, 36-pixel tab controls, and a 20-pixel-high forgot-password target at 390 pixels. It had no horizontal overflow. These are evidence-backed accessibility defects, not authorization to redesign the product.

## Environment contract

Only names were inventoried; no values were read or retained. The complete canonical name inventory is recorded in `baseline-manifest.json`. Live-action/provider gates observed in source default closed unless explicitly set to the enabling value, including:

- `ALLOW_META_LIVE_LAUNCH`
- `ALLOW_META_LAUNCH_INTERRUPTION_TESTS`
- `ALLOW_OPENAI_IMAGE_GENERATION`
- `ALLOW_HEYGEN_VIDEO_GENERATION`
- `ALLOW_AI_TEXT_GENERATION`
- `LOAD_TEST_ALLOW_WRITES`
- `LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED`
- `INTERNAL_LEAD_SMS_ENABLED`
- `SMS_COMPLIANCE_ACK`

No environment, provider, domain, database, or hosting configuration was changed.

## Audit-input integrity caveat

The prior audit replay proved all 40 non-self required-file hashes and sizes, and all required JSON/CSV parse/reconciliation checks, before macOS re-evicted parts of the bundle. A bounded copy attempt later blocked on iCloud materialization. The fully materialized master finding JSON is preserved under `evidence/input-audit/`; the replay counts and exact hydration blocker remain part of the handoff. Audit claims are planning evidence and must be reconfirmed against this canonical tree.
