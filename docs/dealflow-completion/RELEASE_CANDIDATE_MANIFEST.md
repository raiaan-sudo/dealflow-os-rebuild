# DealFlow release candidate manifest

Current verdict: `NO_GO`
Deployment: `NOT EXECUTED`
Implementation commit/tree: `24ada6f142e1f2f9010d9362c4edd16da7742af1` / `7a0792e59d8dd1a151cd9cb975c863e4273fc8e2`
Documentation/bundle seal: the exact descendant commit/tree is recorded and hashed by the external audit-package manifest; no product file may change after the implementation commit.
Protected external production trust root: `NOT SUPPLIED`

## Proven immutable baseline

- commit: `d37c50945ff7004d700301fc89c15eb9273dac5b`
- tree: `1b641a447509dbcae6ca1c23b63520ebdb63c931`
- Vercel project: `dealflow-os-rebuild`
- production deployment: `dpl_J4Ksu4n7sjwdRv8tHBTa5ARDKg9E`
- canonical core domains: `agentdealflow.io`, `app.agentdealflow.io`,
  `www.agentdealflow.io`, `clicktoscale.io`, `www.clicktoscale.io`

## Candidate boundary

The isolated candidate is limited to the canonical `dealflow-os-rebuild`
repository. `internal.agentdealflow.io`, `clicktoscale.agentdealflow.io`, and
`onboarding.agentdealflow.io` are excluded because exact source/deployment
ancestry is not safely proven.

The final implementation commit, tree, package/lock/build/migration/route/test
digests, and generated ledgers must be calculated only after all agents finish,
the worktree is reviewed, and the implementation/docs commits are created. This
file intentionally contains no invented SHA or digest.

## Release guard disposition

Guard v4 requires six `dealflow.release-evidence.v2` manifests:

1. build
2. test
3. remote schema validation
4. visual proof
5. zero-old-worker drain
6. exact-deployment environment attestation

Every manifest must be Ed25519-signed by an authority pinned in a protected
`dealflow.external-release-trust-policy.v1` file outside the repository. The
protected runner supplies only its absolute path and independently authorized
SHA-256 through environment variables with no CLI override. The target commit's
`docs/dealflow-completion/release-trust-policy.json` is informational: its exact
digest must be authorized by the external policy, and any key added by the target
is ignored. The environment/drain evidence must agree on one
provider/project/deployment and be fresh.

No external production policy/digest/key was available or invented. The
repository informational policy remains unconfigured, and `audit-preview` is
always non-gating.

## Mandatory `NO_GO` gates

- Full fresh migration replay fails at the first tracked migration with
  SQLSTATE `42P01`; prior/idempotent/RLS/mixed-version/recovery proof is absent.
- No signed zero-old-worker drain exists.
- No signed exact-deployment environment attestation exists.
- No Meta/GHL/Stripe/Twilio/creative live acceptance or provider canary exists.
- No authorized isolated staging target exists.
- Independent-domain source ancestry remains blocked.
- Workspace selection, consent/retention/deletion, GHL ownership/offboarding,
  operator SLA, and communication policy decisions are open.

The production baseline is not a valid automatic rollback target after
protocol-contract migrations. Any recovery beyond that boundary is forward-only
and separately reviewed.

No deploy, migration, alias, DNS, environment, provider, customer, communication,
spend, or shared-data mutation is authorized by this manifest.
