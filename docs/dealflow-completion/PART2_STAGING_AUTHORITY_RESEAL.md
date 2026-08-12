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
