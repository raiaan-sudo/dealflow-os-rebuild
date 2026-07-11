# State machine catalog

These are normalized current-state models, not claims that every transition is implemented or live-proven.

| id | name | transitions | governing_rules | integrity_gap |
| --- | --- | --- | --- | --- |
| STATE-001 | Authentication | anonymous -> authenticating -> authenticated -> signed_out/expired/error | RULE-001; RULE-017 | Recovery failure leaves fragment tokens. |
| STATE-002 | Workspace context | missing -> resolving -> active_member or recovery/denied | RULE-003 | Header-based recovery branch mismatch; dynamic multi-workspace proof blocked. |
| STATE-003 | Onboarding | draft -> plan_selected -> submitted/completed -> builder | RULE-024 | Completed PII draft remains locally persisted. |
| STATE-004 | Campaign build | draft -> plan_ready -> funnel_ready -> creatives_ready -> selected -> publishable | RULE-016 | Selection and launch prerequisites diverge. |
| STATE-005 | Funnel publication | draft -> validated -> published -> reachable -> archived/updated | RULE-031 | Customer-safe quality gate not observed. |
| STATE-006 | Lead | submitted -> validated -> persisted -> side_effects_queued -> contacted/synced/failed | RULE-005; RULE-008 | Final per-effect truth not durably unified. |
| STATE-007 | System job | pending -> processing/leased -> completed or pending_retry or failed/dead_letter | RULE-009 | Lease can expire during work; overlapping ownership possible. |
| STATE-008 | CRM sync event | pending -> synced or failed(next_retry_at) -> retried | RULE-008; RULE-026 | Retry consumer is absent/unproven. |
| STATE-009 | Creative asset | requested -> queued -> processing -> generated/deferred/failed -> selected | RULE-012; RULE-013 | Dedicated worker and cleanup unproven. |
| STATE-010 | Billing subscription | none/trial -> active -> past_due/canceled/suspended -> recovered | RULE-020 | Repository migrations exist; deployed/live transitions blocked. |
| STATE-011 | Generation credits | available -> reserved/debited -> overdraft_limited -> reconciled/refunded | RULE-021 | Live concurrency and refund paths not tested. |
| STATE-012 | Meta connection | disconnected -> oauth_pending -> connected/expired/error -> reconnected | RULE-017; RULE-018 | No provider reconnect; version/scope drift. |
| STATE-013 | Campaign launch | preflight -> launching -> provider_created/persisted -> launched or failed/unknown | RULE-014; RULE-015 | UI can collapse unknown into launched. |
| STATE-014 | Data deletion | requested -> verified -> queued -> processing -> completed/failed/status | RULE-025 | Only requested/verified acknowledgment implemented. |
| STATE-015 | Client issue | ingested -> scrubbed -> grouped -> operator_review -> action/resolved | RULE-023 | Untrusted content crosses into prompt. |
| STATE-016 | Customer success | activated -> value_tracking -> at_risk/cancel_intent -> intervention/retained/churned | RULE-022 | No-data and unavailable can collapse. |
## Highest-risk transition failures

- STATE-007 can return from processing to pending by lease expiry while the original process continues.
- STATE-008 records a retry timestamp without an observed due-time consumer.
- STATE-013 can display launched from query state rather than persisted provider/persistence state.
- STATE-014 stops after verification/acknowledgment.
- STATE-015 crosses untrusted telemetry into an operator prompt.

