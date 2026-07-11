# End-to-end workflow dossiers

## FLOW-001 — Anonymous acquisition

- Forward trace: Marketing/partner entry -> CTA -> signup/login or public funnel
- Related features: FEAT-001; FEAT-003; FEAT-012
- Proof tier: A/C
- Closure: Marketing and selected public funnel safely viewed; CTA destination writes not exercised.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-002 — Authentication and recovery

- Forward trace: Login/signup/recovery -> session -> workspace/billing context -> app
- Related features: FEAT-004; FEAT-005; FEAT-006
- Proof tier: A/C
- Closure: Anonymous redirect proven; authenticated and recovery completion NOT_PROVEN.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-003 — Onboarding to campaign plan

- Forward trace: Onboarding draft -> plan -> campaign creation -> builder
- Related features: FEAT-007; FEAT-008; FEAT-009
- Proof tier: C
- Closure: Source-proven; persistence/live tenant behavior NOT_PROVEN.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-004 — Funnel build and publication

- Forward trace: Campaign plan -> generation/edit -> publish -> public slug
- Related features: FEAT-010; FEAT-011
- Proof tier: A/C
- Closure: Public output proven; mutation/publish transition not performed.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-005 — Public lead capture

- Forward trace: Public form -> validation/abuse controls -> lead insert -> job enqueue -> thank-you
- Related features: FEAT-012; FEAT-013
- Proof tier: A/C
- Closure: Form/read path proven; POST deliberately skipped.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-006 — Lead downstream effects

- Forward trace: Queued lead -> entitlement -> SMS + Meta CAPI + GHL -> event/log status
- Related features: FEAT-014; FEAT-015; FEAT-016
- Proof tier: C
- Closure: Static source only; per-effect failure truth/idempotency deficient.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-007 — Creative generation and selection

- Forward trace: Intake -> static/video generation -> validation/QA -> selection -> preview
- Related features: FEAT-017; FEAT-018; FEAT-019; FEAT-020
- Proof tier: C
- Closure: Provider calls and worker completion not exercised.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-008 — Billing and credits

- Forward trace: Plan/status -> checkout/webhook -> entitlement/credits -> portal/cancel
- Related features: FEAT-021; FEAT-022; FEAT-023
- Proof tier: C
- Closure: No Stripe/database mutation; deployed lifecycle NOT_PROVEN.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-009 — Meta connection

- Forward trace: Connect -> signed state/cookie -> provider consent -> callback -> encrypted token/selections
- Related features: FEAT-024; FEAT-025
- Proof tier: C
- Closure: No reconnect/provider consent; current version/scopes NOT_PROVEN.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-010 — Campaign launch

- Forward trace: Preflight -> Meta execution -> persistence -> progress -> success
- Related features: FEAT-026; FEAT-027
- Proof tier: C
- Closure: No launch performed; success truth contradicted in UI.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-011 — Reporting and optimization

- Forward trace: Sync/performance -> dashboard -> recommendation/action -> approval/execution
- Related features: FEAT-028; FEAT-029
- Proof tier: C
- Closure: Static code only; KPI freshness and execution boundary NOT_PROVEN.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-012 — System job processing

- Forward trace: Create -> pending -> claim/lease -> handler -> complete/retry/dead-letter -> stream
- Related features: FEAT-030
- Proof tier: C
- Closure: Lease and tenant defects confirmed; worker runtime not executed.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-013 — Operator issue response

- Forward trace: Telemetry/records -> command center/issues/monitor -> prompt/action
- Related features: FEAT-031; FEAT-032; FEAT-033; FEAT-039
- Proof tier: C
- Closure: False-calm and prompt-injection paths confirmed.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-014 — Customer success and support

- Forward trace: Activation/value/cancellation/feedback -> checklist/ticket -> operator
- Related features: FEAT-034; FEAT-035
- Proof tier: C
- Closure: Provider and live data behavior NOT_PROVEN.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-015 — Growth Agent

- Forward trace: Research/mission -> tasks/approvals -> outbound/calls/replies -> reports/memory
- Related features: FEAT-036
- Proof tier: C
- Closure: Route family mapped; complete business execution NOT_PROVEN.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-016 — Sales Copilot

- Forward trace: Analyze/playbook -> objection/reply -> calls/setters -> metrics/evals/memory
- Related features: FEAT-037
- Proof tier: C
- Closure: Route family mapped; complete business execution NOT_PROVEN.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-017 — Data deletion request

- Forward trace: Signed provider request -> identity resolution -> deletion/anonymization -> status
- Related features: FEAT-038
- Proof tier: C
- Closure: Only verification and acknowledgment exist; execution missing.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## FLOW-018 — Internal QA proof

- Forward trace: Secret/flags -> QA session or Stripe test objects -> evidence
- Related features: FEAT-040
- Proof tier: C
- Closure: Not executed; production isolation insufficiently proven.
- Reverse check: the endpoint/job/provider/data surfaces named by this flow are represented in artifacts 07, 13, and 14; unresolved dynamic proof is carried into artifact 23.

## Cross-flow defects

- FLOW-006 can terminate the parent job as completed while child delivery results fail.
- FLOW-010 can show success without persisted successful launch state.
- FLOW-012 can re-lease still-running work and crosses user/workspace ownership models.
- FLOW-013 can show false calm and transform public telemetry into operator prompt content.
- FLOW-017 acknowledges deletion without implementing the lifecycle.

