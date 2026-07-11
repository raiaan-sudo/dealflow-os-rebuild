# Release evidence trust root and candidate policy

Verdict: `NO_GO`

The repository file
`docs/dealflow-completion/release-trust-policy.json` is informational candidate
policy only. Its authority list is empty and guard v4 never uses a key declared
by `--target` to verify that target. This prevents a candidate commit from adding
its own public key, self-signing evidence, and authorizing itself.

No protected production trust root, production signing key, signed deployed
environment attestation, or signed old-worker drain was available in this run.
None was invented.

## Independent trust-root contract

Release mode requires a `dealflow.external-release-trust-policy.v1` JSON file
outside the repository. Its location and exact SHA-256 are accepted only through
protected runner environment variables:

- `DEALFLOW_RELEASE_TRUST_POLICY_PATH` — absolute path outside the repository;
- `DEALFLOW_RELEASE_TRUST_POLICY_SHA256` — exact digest independently pinned by
  the release authority; and
- `DEALFLOW_RELEASE_TRUST_PREVIOUS_POLICY_SHA256` — required only for rotation
  generation greater than one.

There is deliberately no CLI option for these values. The file and its immediate
directory must be regular/private, not symlinks, and not group/world writable.
The guard hashes the bytes before parsing. It emits the policy ID, digest,
rotation generation, authority fingerprints, and a one-way sanitized source ID;
it does not emit the absolute path, public-key PEM, signatures, or environment
values.

The external policy must independently define:

- exact production provider/project identity;
- evidence recency and future-skew limits;
- expected Stripe live mode;
- allowed authority IDs, key IDs, sources, public-key fingerprints, and evidence
  classes;
- one exact authorized digest for the informational repository candidate policy;
  and
- rotation generation plus the prior external-policy digest when rotating.

The target candidate policy is read from the exact Git commit and hashed. If its
digest differs from the digest authorized by the external policy, release mode
fails with `release_guard_candidate_policy_digest_mismatch`. Any authority
material present in the target policy is reported as ignored and is never used
for verification.

## Evidence contract

Release mode accepts six `dealflow.release-evidence.v2` manifests: build, tests,
remote schema validation, visual proof, old-worker drain, and exact-deployment
environment. Every manifest must:

- identify the exact target commit and sanitized authoritative source/run;
- complete after the target and within the external trust root's recency window;
- carry the SHA-256 of its canonical unsigned content;
- be Ed25519-signed by an authority pinned only in the protected external policy;
  and
- stay within that authority's source and evidence-type scope.

Drain and environment evidence must name the same provider/project/deployment.
The environment manifest accepts only allowlisted non-secret booleans: required
safe flags, Stripe live mode, Turnstile production configuration, Meta
Pixel/CAPI policy presence, and Meta/access/internal/Stripe secret-strength
policies. Raw or unknown environment fields fail closed.

`audit-preview` may inspect structurally valid unsigned evidence without an
external root, but it always returns `NON_GATING_PREVIEW` and can never authorize
a release.

## Out-of-band bootstrap

Bootstrap must occur outside a candidate change:

1. A release/security owner generates the Ed25519 authority key in an approved
   protected system; the private key never enters the repository or evidence
   bundle.
2. The owner reviews the exact informational candidate-policy bytes and records
   their SHA-256 in an external generation-1 policy.
3. Generation 1 sets `previousPolicySha256` to `null`.
4. The external policy is stored in a protected runner/secret mount outside the
   checkout with a private directory and read-only/private file permissions.
5. A separately controlled runner configuration pins the policy path and digest.
   A pull request or target commit cannot modify those protected values.
6. Two-person/release-owner review should verify the external policy digest and
   authority fingerprint before the first release run.

If the runner environment itself is caller-controlled, this trust claim is not
valid. Guard v4 records the inputs it can verify but does not pretend to prove the
administrative security of the runner.

## Authorized rotation

Rotation cannot be authorized by editing the target:

1. Create a new protected external policy with generation `N+1`, the new public
   key/fingerprint, and `previousPolicySha256` equal to the exact generation-N
   external-policy digest.
2. Through the out-of-band protected runner change process, update the pinned
   current path/digest and set
   `DEALFLOW_RELEASE_TRUST_PREVIOUS_POLICY_SHA256` to generation N's digest.
3. Guard v4 verifies both the new policy bytes and the previous-digest link.
4. Run a non-production proof, complete independent review, then retire the old
   signing authority according to the owner-approved key lifecycle.

A generation increase without the protected previous-digest input fails. A
target-only key or policy change cannot rotate the trust root.

## Deterministic proof

`npm run test:release-guard` proves:

- valid evidence signed by an externally pinned runtime-generated test key
  passes;
- missing external path/digest fails;
- external policy digest mismatch fails;
- unsigned and self-signed evidence fails;
- a target commit that adds its own valid key and self-signs still fails because
  its candidate-policy digest is not externally authorized;
- an authorized generation-2 external rotation passes only with the protected
  prior-policy digest; and
- rotation without that prior digest fails.

The repository production policy remains unconfigured, and no external
production trust root is supplied. The only valid release decision is `NO_GO`.
