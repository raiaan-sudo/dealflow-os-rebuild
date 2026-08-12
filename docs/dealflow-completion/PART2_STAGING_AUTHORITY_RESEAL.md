# Part 2 staging authority reseal

Part 2 predeployment qualification found that three staging safety gates still
required the superseded `codex/dealflow-release-closure-plan` branch. The sealed
Part 1 authority is `codex/dealflow-part1-closure-20260811`, so the harness would
reject the correct source before any hosted action.

Implementation commit `96b7ef9b1964ec9f855ee44ea16188fb7c5b8b54`
(tree `58a0bdea4920af19af7880e3bd46a712f1c0e686`) binds the acceptance
runner, migration broker, and synthetic-retention authority broker to the sealed
Part 1 branch and updates their contract assertions. It does not change the
application, migration portfolio, provider behavior, or production runtime.

The successor seal must regenerate the current-source inventory and deployable
source manifest, pass the complete local qualification portfolio twice from the
same retained checkout, and be used as the only source for isolated staging.
The Part 1 bundle remains immutable and is superseded only for Part 2 staging
execution by this documented successor.

The first current hosted resume then proved a second fail-closed tooling defect:
the verifier required the historical exact-129 application proof to report the
new successor branch name. Commit
`0c8534b119feb61b8fca8adb20ea8df2502cc7b4` preserves the current-branch
execution gate while validating prior evidence against its exact historical
branch, commit, tree, broker source hash, ancestry, schema digest, structural
catalog digest, and all 129 migration hashes. This permits legitimate successor
reseals without weakening prior-proof identity.

The first hosted deployment of the successor seal exposed a third stale
tooling assertion after the remote build completed: the current Vercel/Next.js
compiler emits two narrow local image namespaces, `/_next/static/media` and
`/_next/static/immutable/media`, while the verifier allowed only the former.
The hosted metadata still proved zero remote patterns, zero legacy domains,
zero optimizer-eligible manifest assets, and exact safe image settings. The
successor contract now requires both exact compiler-owned namespaces and still
rejects every arbitrary local path, extra pattern, remote source, or legacy
domain. The failed hosted attempt remains preserved in Part 2 evidence.
