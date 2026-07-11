# Data model, tenancy, privacy, and lifecycle

## Bottom line

The intended tenant model is split among organization_id, workspace_id, and user_id. Selected RLS/force-RLS/revoke migrations are positive source controls, but service-role application paths and schema relationships contain material gaps. Live schema, migration order, policies, storage rules, retention, and cross-tenant behavior were not queried.

## Entity inventory

| id | entity | purpose | intended_tenant_key | observed_control | sensitivity | live_schema_status |
| --- | --- | --- | --- | --- | --- | --- |
| DATA-001 | users | identity/profile | user | authenticated/RLS | PII | NOT_PROVEN |
| DATA-002 | organizations | tenant/workspace | organization | membership RLS | business data | NOT_PROVEN |
| DATA-003 | organization_memberships | tenant membership | organization + user | private membership helper policies | identity/authorization | NOT_PROVEN |
| DATA-004 | agent_profiles | operator/agent profile | user/organization | selected RLS migrations | PII | NOT_PROVEN |
| DATA-005 | campaign_plans | campaign strategy and inputs | organization/campaign/user mixed | selected RLS migrations | business/marketing data | NOT_PROVEN |
| DATA-006 | campaigns | campaign root state | organization or owner | mixed organization/user predicates | business/provider IDs | NOT_PROVEN |
| DATA-007 | creative_assets | creative and provenance | campaign/user mixed | asset routes use user ownership | media/provider metadata | NOT_PROVEN |
| DATA-008 | leads | prospect record | organization/campaign | service-role insert and tenant reads | name/email/phone/tracking | NOT_PROVEN |
| DATA-009 | lead_assignments | lead ownership | organization/agent | migration/RLS selected | PII relation | NOT_PROVEN |
| DATA-010 | lead_notifications | notification delivery state | organization/lead | migration/RLS selected | contact/provider state | NOT_PROVEN |
| DATA-011 | lead_messages | inbound/outbound messages | organization/lead | RLS/idempotency migrations | message/phone | NOT_PROVEN |
| DATA-012 | billing_subscriptions | subscription truth | organization/customer | service role and tenant reads | billing identifiers/status | NOT_PROVEN |
| DATA-013 | stripe_webhook_events | webhook idempotency/order | platform/internal | service-role only hardening | provider event metadata | NOT_PROVEN |
| DATA-014 | user_credits | credit balance | user/organization | selected RLS/service paths | financial usage | NOT_PROVEN |
| DATA-015 | user_credit_ledger | credit transactions | user/organization | selected RLS/service paths | financial audit | NOT_PROVEN |
| DATA-016 | provider_usage_limits | provider spend/limits | organization/provider | internal table hardening | financial controls | NOT_PROVEN |
| DATA-017 | provider_usage_events | provider usage/idempotency | organization/campaign/provider | hardening migration order partially blocked | financial/provider data | NOT_PROVEN |
| DATA-018 | system_jobs | async work and payload | user and organization mixed | direct grants revoked; service queries user-scoped | PII/provider payload | NOT_PROVEN |
| DATA-019 | system_job_logs | job event/error/result | inherits job scope | service-role access | PII/errors/provider result | NOT_PROVEN |
| DATA-020 | rate_limit_buckets | abuse throttling | bucket/scope | internal function access | IP/key metadata | NOT_PROVEN |
| DATA-021 | app_schema_metadata | schema version | platform | service-only hardening | operational metadata | NOT_PROVEN |
| DATA-022 | marketing_accounts | Meta account/token/selections | organization/user | application scope + encrypted token | credentials/provider IDs | NOT_PROVEN |
| DATA-023 | meta_launch_locks | launch idempotency/locking | campaign/organization | selected migrations | provider execution state | NOT_PROVEN |
| DATA-024 | campaign_sync_snapshots | Meta sync state | campaign/organization | selected tenant policies | provider performance | NOT_PROVEN |
| DATA-025 | performance_tracking | campaign metrics | campaign/organization | selected tenant policies | analytics | NOT_PROVEN |
| DATA-026 | targeting_intelligence_patterns | optimization intelligence | organization/campaign | selected tenant policies | marketing analytics | NOT_PROVEN |
| DATA-027 | campaign_action_suggestions | recommended actions | campaign/organization | selected tenant policies | automation decision data | NOT_PROVEN |
| DATA-028 | campaign_draft_actions | approval/execution drafts | campaign/organization | selected tenant policies | automation actions | NOT_PROVEN |
| DATA-029 | campaign_value_reports | value/KPI reports | organization/campaign | selected migration | business metrics | NOT_PROVEN |
| DATA-030 | activation_events | activation telemetry | organization/user | policy content partially mapped | behavioral analytics | NOT_PROVEN |
| DATA-031 | billing_cancellation_intents | cancellation reason/state | organization/user | policy content partially mapped | customer/billing data | NOT_PROVEN |
| DATA-032 | customer_success_checklists | customer success operations | organization/user | policy content partially mapped | customer operations | NOT_PROVEN |
| DATA-033 | client_error_events | browser error telemetry | public ingest/operator read | service-role persistence | stack/metadata/IP-like data | NOT_PROVEN |
| DATA-034 | partner_configs | partner branding/support/defaults | partner | authenticated select true in reviewed migration | cross-partner metadata | NOT_PROVEN |
| DATA-035 | partner_ghl_config | partner CRM credentials/config | partner | service/application access | secret-adjacent provider config | NOT_PROVEN |
| DATA-036 | workspace_ghl_mapping | workspace to GHL location | workspace + partner | RLS but missing exclusivity invariant | tenant routing | NOT_PROVEN |
| DATA-037 | workspace_partner_attribution | workspace partner identity | workspace + partner | unique workspace | tenant routing | NOT_PROVEN |
| DATA-038 | lead_crm_sync_events | CRM delivery/retry state | lead + workspace | RLS but no same-tenant FK invariant | lead/provider metadata | NOT_PROVEN |
| DATA-039 | Browser localStorage onboarding draft | client draft persistence | unscoped browser profile | none beyond browser origin | PII/budget/offer | CONFIRMED |
| DATA-040 | Creative object storage | generated/uploaded media | campaign/user paths | storage/path validation in code | customer media | NOT_PROVEN |
| DATA-041 | Higgsfield worker temp files | temporary creative inputs | worker host | approved-root controls; no cleanup | customer media | CONFIRMED |

## Tenancy findings

- System-job list/get/log/stream use same-user scope rather than active organization scope.
- Campaign access often uses organization membership or owner while assets/jobs use user ownership.
- GHL workspace-location and lead/workspace consistency are not fully database-enforced.
- Authenticated partner_configs read is broad in the reviewed migration.
- Service-role paths bypass RLS and therefore require explicit application tenancy; RLS text alone cannot mitigate them.

## Privacy and lifecycle findings

- Onboarding PII persists in a global localStorage draft with no TTL/user/workspace namespace and remains after completion.
- Lead PII/tracking is duplicated into job payloads and provider/log surfaces; retention cleanup was not proven.
- Client error stacks/metadata are retained and exposed to operators; deletion schedule not proven.
- Meta data-deletion acknowledgment does not create a durable deletion lifecycle.
- Higgsfield temporary creative inputs have no observed cleanup.

## Not a compliance conclusion

This is a technical inventory using privacy/security control taxonomies. It does not assert legal compliance, certification, lawful basis, or legal retention obligations. Specialist review is required.

