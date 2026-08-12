# Isolated staging acceptance

> **Current harness contract.** The active candidate contains 129 ordered
> migrations. Historical 103, 104, and 115 migration proofs remain provenance,
> not current acceptance. Current staging must use an exact fresh 129 replay, an
> independently pinned forward chain through 129, or read-only verification of
> an already proven exact 129 state.

This harness is the only supported one-pass path from an exact local release seal to the isolated DealFlow staging project. It is fail-closed and does not authorize production.

## Safety boundary

- Target application: `dealflow-os-rebuild-selfserve-clean.vercel.app` and its deployment-specific Vercel URL only.
- Target database: the fingerprint-pinned Supabase project with safe suffix `qibh` only.
- Data: ten clearly labeled synthetic roles, two isolated white-label partners,
  their child tenants, and synthetic fixtures only.
- External effects: Meta, GHL, Stripe, Twilio, creative-provider, support-delivery, advertising-spend, and customer-communication actions remain disabled.
- Production/shared hosts, databases, provider credentials, customer data, live charges, live ads, communications, and production deployment are rejected.
- The staging project's Vercel production slot is used only because the entire Vercel project is isolated staging. Runtime identity must match the pinned staging project id and staging host attestation.
- Exact isolated staging renders every current Next Image directly with an explicit literal `unoptimized` prop and sets both `images.unoptimized: true` and `images.disableStaticImages: true` only under the exact staging-project attestation. Both `images.localPatterns: []` and `images.remotePatterns: []` are explicit deny-all policies; leaving local patterns undefined would allow local optimizer inputs. Production receives no image-config override. A deployable-manifest-bound AST and asset inventory rejects alternate or named Next Image modules, binding aliases/calls, spread or false/dynamic props, static image imports/re-exports/requires/dynamic imports/`new URL` construction, CSS image `url(...)` references, raw optimizer/static-media construction, and every raster/vector build input outside the fixed `public/` direct-asset portfolio. It also pins the exact dynamic image-producing route inventory. Documentation screenshots are excluded from the Vercel build input set and remain audit evidence only.
- Vercel owns both provider image paths, `/_next/image` and `/_vercel/image`; the application proxy does not claim either path is application-gated. Immediately after deployment, the runner re-reads the exact candidate through `GET /v13/deployments/<exact-id>` and requires the root compiled `.images` configuration to contain no unknown keys, empty remote/domain inputs, only Vercel's exact compiled `/_next/static/media` local regex, the exact size portfolio including `32`, quality `[75]`, cache TTL `14400`, format `image/webp`, SVG optimization disabled, the exact sandbox CSP, and attachment disposition. This hosted compiled configuration is not described as deny-all because it permits that exact static-media namespace. Separately, the manifest-bound source portfolio proves zero optimizer-eligible static-media inputs; it does not claim to be an authoritative inventory of every hosted build output. A successful proof persists no deployment/project IDs or raw metadata; a mismatch fails closed and retains only a sanitized shape of counts and exact-match booleans. Closure is claimed only for the enumerated DealFlow optimizer-source portfolio: the commit-bound private source, every approved static/dynamic source, and the retired source. For each enumerated source, the hosted HTTP gate requires both provider paths to return one identical rejection class in every no/valid/invalid credential mode before and after warming: status `400`, `text/plain`, exactly `84` bytes, exact cache control `public, max-age=0, must-revalidate`, no redirect or URL change, exact `x-vercel-error: INVALID_IMAGE_OPTIMIZE_REQUEST` (SHA-256 `181453757443407acf6ee0919e1a19c891d852a9d505bd40c95c3b9029eee2cf`), and an exact body envelope whose dynamic request ID is `<three lowercase letters><digit>::<32 URL-safe characters>`. Only the normalized redacted template hash `77766dbf7dfbed83e26d498b516cde4d31dffb22a1374568bbbb2d9eeb094202` and structural booleans/lengths are persisted; the raw body, raw body hash, request ID, error header, access values, and cookies are not. The deterministic 30-byte local Next rejection is recognized by the reusable classifier but is explicitly forbidden as hosted acceptance. A broad `400`, missing/wrong error code, altered template/ID/cache/status/URL, image response, or mixed disposition fails closed. The custom `/_dealflow-staging-image-optimizer-disabled` path remains application-owned and must return the exact DealFlow JSON `404` in every mode.
- The hosted source proof uses `/staging-private-image-gate-proof-v2/<exact-commit>.png`, so every candidate has a fresh no-query cache key. The route rejects any query string with its exact private no-store `404`. Without or after invalid credentials it must return the exact DealFlow `404`; valid header/cookie credentials must return its fixed `200 image/png`. Every approved direct public image, including both actual logo paths, receives the same no/valid/invalid/post-warm source matrix plus both provider optimizer matrices and the custom-path matrix on every alias. The dynamic Open Graph image and signed provider-media route are separately classified and proven. The former public proof source remains the exact DealFlow `404` in all six credential modes; its historical r5 transform is provenance only and is never accepted as current proof. Normal browser journeys additionally require zero optimizer paths in network requests, `PerformanceResourceTiming`, `img` `src`/`currentSrc`/`srcset`, `source` `src`/`srcset`, and image-preload `href`/`imagesrcset`, including raw, resolved, HTML-encoded, and percent-encoded attribute variants. A detached behavioral fixture proves every dormant DOM/preload surface is detected without issuing a request. Browser evidence retains only the surface name and exact optimizer pathname—never a full URL or query. Deliberate HTTP gate probes remain outside that zero-use browser assertion.

## Required preconditions

Run both exact final-verification rounds first. Each summary must be schema v3, Node 24, bound to the same clean commit/tree and exact migration portfolio, have every local command pass, and contain only the three allowlisted authenticated-hosted deferrals:

- `npm run rls:cross-tenant`
- `npm run rls:fixture-smoke`
- `npm run operator:debt`

The execution shell must contain the exact isolated staging Supabase authority, the existing staging Vercel authority, one strong Vercel automation-bypass secret for that isolated project, and freshly supplied staging-only QA password, partner-attribution signing secret, and internal-system secret. Secrets are accepted from process memory and sent to Vercel through stdin. The allowlisted application secrets are stored only as sensitive environment values in the isolated staging project; no secret value is placed in command arguments, process-environment dumps, logs, or evidence. The automation-bypass secret is not installed as an application environment value: it is sent only to an exact allowlisted staging alias with redirect following disabled. Browser proofs exchange it for one host-only `_vercel_jwt` cookie per exact staging origin, require Vercel's exact same-origin `307` cookie response, and never install the secret as a browser-wide header. Database-owner transfer uses the pinned Keychain entry, PostgreSQL 17.6, TLS `verify-full`, and the commit-bound `config/security/supabase-prod-ca-2021.crt` trust bundle (SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`). The public CA is the `Supabase Root 2021 CA` downloaded from Supabase's official certificate endpoint; its certificate fingerprint is `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA` and it expires April 26, 2031.

The controlling broker must independently pin the Vercel CLI before starting
the runner. All three values are mandatory:

```text
VERCEL_CLI_JS=/absolute/canonical/path/to/node_modules/vercel/dist/index.js
VERCEL_CLI_SHA256=<lowercase SHA-256 of the exact entry file>
VERCEL_CLI_INSTALLATION_SHA256=<lowercase deterministic SHA-256 of the complete npx installation closure>
```

The installation digest covers the installation package and lock files, the
complete Vercel package, imported chunks, resolved dependencies, internal
symlinks, normalized non-writable modes, and every relative path. The broker
must obtain both digests independently; the runner never computes a current
digest and promotes it to authority. It verifies the source, copies the full
closure into a fresh private content-addressed snapshot, removes every write
bit, and validates that full closure before and after every Vercel command.
Missing, malformed, changed, writable, externally linked, added, or removed
installation content fails before the command executes. These digests are not
secrets, but the absolute source path remains local operator evidence and is
not written to the sanitized release bundle.

Every zero-external-effects flag must have the exact value enforced by `src/lib/safety/zero-external-effects.ts`. In particular, `STRIPE_FORCE_TEST_MODE`, both lead-load bypass flags, and all provider-write flags remain `false`.

`vercel.json` pins dependency installation to `npm ci --ignore-scripts --no-audit --no-fund`. This prevents Vercel's dependency-install phase from rewriting `package-lock.json` before the hosted source-identity prebuild verifies the exact uploaded portfolio. `package.json` pins Node `24.x`, the supported LTS major used by the exact local verification and hosted staging build portfolios.

## Execution

```bash
npm run staging:acceptance -- \
  --execute \
  --verify-existing-migrations \
  --deploy \
  --prior-migration-proof-dir /absolute/path/to/latest-exact-129/migration-proof \
  --evidence-dir /absolute/durable/owner-only/dealflow-staging-acceptance-evidence-<seal> \
  --round-one /absolute/path/to/round-1/verification-summary.json \
  --round-two /absolute/path/to/round-2/verification-summary.json
```

The additional authorization value is exact:

```text
DEALFLOW_STAGING_ACCEPTANCE_AUTHORIZATION=AUTHORIZE_ISOLATED_STAGING_ACCEPTANCE_V1
```

For a genuinely empty isolated project, `--apply-migrations` is the fresh atomic
mode and forbids a prior proof. `--verify-existing-migrations` is the exact
read-only schema mode. Exactly one mode is accepted. The pinned qibh project has
retained, digest-bound proof of an exact 129-migration state. The current
candidate therefore uses `--verify-existing-migrations` with the latest passing
exact-129 proof. A forward mode is valid only for its explicitly pinned
predecessor and ordered successor stages; it never falls back to fresh
application on a nonempty project.

Without the required flags, that authorization, every required secure input, an exact clean branch/commit/tree, and both accepted round summaries, the runner performs no remote mutation.

## Fixed order

1. Verify local repo, Node, branch, commit, tree, tracked-file digest, migration portfolio, Supabase fingerprint, Vercel fingerprints, all safety flags, secure inputs, and both local verification rounds.
2. Reconcile the exact 91-key isolated-staging Vercel environment. Read current metadata first; batch-upsert only missing or value-drifted encrypted keys; patch structural drift by exact variable ID; respect `Retry-After`; stop on deterministic 4xx; and perform provider readback before any retry after transport or 5xx ambiguity. Encrypted values require decrypted digest readback. The ten Vercel-sensitive values are intentionally unreadable after creation, so they require exact-ID idempotent rewrite, successful provider acknowledgement, and exact metadata readback without claiming value decryption. Reject unexpected names and persist no values or value digests.
3. For the current qibh state, verify the exact sealed 129-migration history, independently pinned schema and catalog identities, ACLs, closed runtime controls, empty storage, exact synthetic auth surface, and exact synthetic relational/credential row surface. Fresh apply is allowed only for a genuinely empty isolated project. Forward mode never falls back to fresh application on nonempty state. An existing exact-129 state is accepted read-only only when its current history and normalized catalog match the pinned proof.
4. Through a separate database-owner broker, install, tightly recover, or exactly reuse the qibh-only synthetic retention policy. Prove service-role SELECT-only access, zero table- or column-level writes, zero anon/authenticated/PUBLIC grants, exact policy values, and the actual relation owner.
5. Deploy the exact commit to the isolated Vercel staging project and verify deployment metadata. Assign each allowlisted app alias one at a time and prove the exact control-plane mapping. The monotonic, 180-second edge-propagation gate may retry only Vercel's exact `404 DEPLOYMENT_NOT_FOUND` surface. An alias that is not additionally protected must reach DealFlow's exact closed 404 gate. An alias protected by Vercel Authentication must first return the exact public `302 https://vercel.com/sso-api` shape, then reach DealFlow's exact closed 404 only when the automation-bypass header is sent to that same alias without the DealFlow gate secret. Raw redirect queries, nonces, bypass values, and cookies are never persisted. Recheck the candidate mapping before loading the DealFlow staging secret, then prove the unauthenticated, header, and cookie surfaces sequentially before assigning the next alias. Prove the real Next chunk remains gated; the release-bound private source, exact public direct-asset portfolio, Open Graph image, signed provider-media source, and retired source satisfy their complete matrices; both provider-owned optimizer paths return only the pinned normalized Vercel edge rejection; and the custom optimizer path returns only DealFlow's exact closure. Unexpected redirects, URL changes, public 200s, optimizer image responses, broad status acceptance, generic or altered Vercel errors, mixed provider-path dispositions, mapping drift, and deadline exhaustion fail closed and trigger rollback.
6. Seed the deployment-bound white-label hosts and ten synthetic roles twice, proving idempotency and atomic partner attribution.
7. Run the exact authenticated RLS cross-tenant and fixture-smoke commands, verify fixture cleanup, and run the exact operator-debt command.
8. Prove zero external effects on stable direct and both deployment-bound partner hosts.
9. Run all ten role journeys on Chromium desktop, Chromium mobile, Firefox, and WebKit with zero skips, fail-closed network boundaries, and tenant isolation.
10. Run GET-only hosted load against public routes and the internal zero-effects control. Hosted lead-capture POST load is deliberately forbidden; it remains a local-only proof.
11. Compare effect-bearing table counts, rescan evidence for protected values and probable credentials, set private permissions, write the machine-readable manifest, and seal every artifact with SHA-256 checksums.

Browser navigation is settled by exact application reads, never by sleeps or a
broad `networkidle` waiver. Before a document replacement, the suite binds the
expected same-origin GET pathname, requires its body to finish with exact HTTP
200, and waits for the canonical post-redirect pathname. Dashboard journeys
drain the campaign optimization-policy read; the legacy builder redirect drains
the onboarding billing read; and the results redirect drains the resulting
dashboard policy read. Non-navigation request failures remain authoritative.

The public funnel allows only Cloudflare's official Turnstile test traffic on
the exact challenge origin: the fixed loader, one bounded versioned loader,
challenge-platform requests, and the canonical test-widget blob shape. The
WebKit-only intercepted blob error is ignored only for that exact GET/XHR/error
tuple after the widget is proven enabled. Public privacy and terms links disable
Next.js prefetch so speculative legal-route reads cannot be cancelled during
the Turnstile assertion.

If a configured Playwright process exits nonzero, the runner parses any
available JSON and JUnit reporters before cleanup and retains one bounded
`<suite>-failure-diagnostic.json` at the evidence root. That diagnostic remains
explicitly `FAILED`; it records computed outcome and per-project counts, the
complete bounded project/test-title portfolio, reporter agreement, and
truncated sanitized error text. It contains no reporter contents, reporter
paths, application hosts, credentials, or raw filesystem paths. Missing,
malformed, oversized, symlinked, or changing reporters are recorded as rejected
evidence and never converted to a pass. The raw JSON, JUnit, HTML, screenshots,
and reporter directories remain unsealed and are still deleted by terminal
failure cleanup. If the command times out, is signaled, or the full diagnostic
cannot itself be constructed, the runner retains a deterministic digest-only
`FAILED` fallback instead; it never invents reporter counts or a process exit
status for an abnormal termination.
The final forbidden-material assertion scans actual diagnostic keys and string
values rather than JSON-encoded bytes, so ordinary multiline Playwright output
cannot be misclassified as a Windows path through JSON's `\\n` escaping.
If the outer evidence sanitizer must destroy and recreate an unsafe partial
bundle, terminal cleanup rewrites that same suite's digest-only `FAILED`
fallback into the clean root before sealing. The fallback survives without
preserving raw reporter text, URLs, URI schemes, hostnames, filesystem paths,
or protected runtime values.

## Verdict semantics

A successful harness run proves only the safe isolated-staging surfaces it actually exercised. It must return production `NO_GO` while any required worker, lead-delivery, GHL, Meta, Stripe, creative-provider, Twilio, support-delivery, reporting, or recovery journey remains `NOT_PROVEN` or `FAIL`. Seeded end states never count as journey proof, and missing provider credentials never count as a pass.

Static validation is available without remote work:

```bash
npm run test:staging-acceptance-contract
```
