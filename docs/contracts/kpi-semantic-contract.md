# DealFlow KPI semantic contract

Canonical source: `src/lib/analytics/kpi-semantic-contract.ts`

Candidate semantic version: `dealflow-kpi/1.0.0-candidate.1`

Status: `candidate_not_effective`

This contract is deliberately **not dashboard authority**. Its `effectiveAt` and
owner-approval evidence are unset. No target, KPI score, retention result, or
business-success conclusion may be displayed from it until the owner-controlled
decisions are signed and the contract is activated through a separately proven
change.

## Truth boundary

- Paid activation is the first recognized positive Stripe payment projected
  exactly once into `public.commercial_activations`. Setup, navigation, or launch
  readiness is not activation.
- A first launch requires a durable successful `public.campaign_launch_records`
  receipt. Scheduling alone is not a launch.
- A first lead requires a durably persisted and deduplicated `public.leads` row.
  A pixel event or callback alone is not a lead.
- Existing lead statuses and messages are candidate inputs; they do not establish
  an owner-approved qualified-lead, meaningful-conversation, or lead-quality KPI.
- Stripe remains the external billing authority. Local subscription/webhook rows
  are supporting projections, not a complete MRR, retention, or churn semantic
  layer.
- Provider usage reservations and estimates are not actual cost. Provider-cost
  aggregation remains disabled until currency, FX, settlement, and invoice
  reconciliation are approved and implemented.
- Server-marked synthetic, staging, QA, demo, and canary records must be excluded
  at ingestion, aggregation, UI, and export. Universal enforcement is not yet
  proven, so even the configured event semantics remain partially instrumented.

## Current definition and formula state

| KPI | Definition state | Formula state | Source-of-record boundary | Outcome state |
| --- | --- | --- | --- | --- |
| Activation | Configured by product contract | Configured event count | Stripe positive payment + `commercial_activations` | Event available; reconciliation/exclusions partial |
| First launch | Configured by product contract | Configured first-event timestamp | `campaign_launch_records` | Event available; reconciliation/exclusions partial |
| First lead | Configured by product contract | Configured first-event timestamp | `leads` | Event available; exclusions/backfill partial |
| Qualified lead | Owner decision unconfigured | Unconfigured | `leads` is input only | Not measurable |
| Meaningful conversation | Owner decision unconfigured | Unconfigured | `lead_messages` and GHL are inputs only | Not measurable |
| Time to value | Owner value milestone unconfigured | Unconfigured | Activation plus a future signed milestone | Not measurable |
| MRR | Owner/finance policy unconfigured | Unconfigured | Stripe authority + local projections | Not measurable |
| Gross revenue retention | Owner/finance cohort policy unconfigured | Unconfigured | Stripe authority + local projections | Requires mature cohort |
| Net revenue retention | Owner/finance cohort policy unconfigured | Unconfigured | Stripe authority + local projections | Requires mature cohort |
| Logo churn | Owner/finance cohort policy unconfigured | Unconfigured | Stripe authority + local projections | Requires mature cohort |
| Revenue churn | Owner/finance cohort policy unconfigured | Unconfigured | Stripe authority + local projections | Requires mature cohort |
| Lead quality | Owner scoring/outcome policy unconfigured | Unconfigured | Lead/message/CRM data are inputs only | Not measurable |
| Provider cost | Configured cost boundary | Owner/finance aggregation unconfigured | Provider invoice authority + usage projection | Not measurable |

Every target remains `unconfigured_owner_decision`; the repository supplies no
placeholder percentage, dollar amount, threshold, or target window.

## Activation requirements

Before this contract may power a dashboard or export, the owner-controlled fields
must be signed: definitions, targets, eligibility/exclusions, attribution windows,
currency/FX, refund/dispute treatment, freshness, measurement windows, and
late-event/backfill/restatement policy. The implementation must then add durable
semantic-version attribution, reconcile each source, enforce synthetic exclusion,
and validate golden fixtures plus tenant isolation. Mature-cohort metrics still
cannot claim success until enough real time has elapsed.
