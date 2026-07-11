# Superseded exact-seal verification diagnostic

Status: `SUPERSEDED_WITH_EVIDENCE`

An initial 32-command verification round ran against documentation seal
`3057235213a78551dcf98037b1dbbe31ddaf6762`. It completed with 30 passing
commands and two failing legacy lexical assertions:

1. `test:public-funnel-thank-you` still expected a submit button disabled only
   by submission state and did not recognize the hardened configured Turnstile
   token/action/site-key contract.
2. `scripts/test-lead-tracking-health.mjs` still expected the manual route to
   reload Meta credentials outside the immutable launch-input service instead
   of asserting the snapshot-bound organization preflight and completion
   ordering.

The product build, typecheck, lint, 25/25 completion contracts, security and
tenant checks, release guard, and every disposable-database suite passed in that
round. The two assertions were updated to require the stronger current
contracts and passed directly. Because that changed tracked test source, seal
`3057235...` and its 30/32 result are not final-candidate evidence. The final
bundle uses two new complete rounds against the later clean docs-only seal.

No provider, customer, shared database, deployment, configuration, communication,
or spend mutation occurred. Raw temporary logs are intentionally excluded; the
sanitized machine summary is retained beside this file.
