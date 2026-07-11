# Test coverage and CI truth

## Execution result

Product test execution: 0 passed, 0 failed, 93 SKIPPED_SAFETY. This does not mean tests failed. It means no manifest test entrypoint was proven hermetic, write-free, network-safe, provider-safe, and fully redirected outside DealFlow repositories under the controlling audit contract.

## Discovered test/CI surfaces

| candidate | test_entries | package_scripts | tests_files | scripts_files | ci_workflows |
| --- | --- | --- | --- | --- | --- |
| Primary rebuild | 34 | 61 | 13 | 61 | 0 |
| Homepage | 6 | 24 | 12 | 26 | 0 |
| 300-client alternate | 52 | 91 | 13 | 89 | 1 |
| Internal OS | 1 | 10 | 3 | 3 | 0 |
| Total instances | 93 | 186 | 41 | 179 | 1 |

## Classification distribution

| classification | count |
| --- | --- |
| creative_media_contract | 23 |
| provider_or_integration_contract | 17 |
| load_or_performance | 2 |
| product_workflow_contract | 25 |
| billing_contract | 8 |
| static_or_domain_contract | 13 |
| browser_e2e | 3 |
| evaluation_or_composite | 2 |

## Why tests were skipped

- Primary Playwright starts next dev and writes .next; alternate Playwright builds/starts and writes test-results.
- Authenticated E2E creates a QA session and POSTs onboarding/campaign data.
- Performance suites include lead-capture, dashboard, webhook, load, stress, spike and soak traffic with explicit write gates.
- Provider/billing/integration scripts may reach database or external providers; transitive effects were not individually proven impossible.
- Ten primary test files were dataless at the module-inventory snapshot.
- Safe POST probes were independently skipped because invalid/unsigned request isolation was not closed.

## CI truth

- Only the 300-client alternate contains the observed CI workflow; strongest app and marketing candidates do not.
- The alternate workflow includes lint, typecheck, build, offline smoke, route security and predeploy proof, but canonicality is unproven.
- Actions use major-version tags rather than immutable commit SHAs.
- The route-security checker is lexical and can false-pass; existing green results would not prove semantic guards.

## Required future proof

Run from disposable local copies with every artifact redirected to the audit/test workspace and with isolated Supabase/Stripe/Meta/Twilio/GHL/provider fixtures. Capture exact commit, environment, commands, assertions, pass/fail output, side-effect ledger, and cleanup. Do not reuse this audit as a claim that tests pass.

