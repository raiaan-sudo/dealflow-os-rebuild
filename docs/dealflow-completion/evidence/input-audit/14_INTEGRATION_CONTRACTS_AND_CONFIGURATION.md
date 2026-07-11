# Integration contracts and configuration

## Integration matrix

| id | provider | purpose | credential_or_trust_mode | positive_controls | gap_or_blocker | live_contract_status |
| --- | --- | --- | --- | --- | --- | --- |
| INT-001 | Stripe | billing checkout/portal/webhook/credits | server secret + webhook signature | Signature/idempotency hardening in source/migrations. | No provider call; deployed lifecycle NOT_PROVEN. | NOT_PROVEN |
| INT-002 | Meta OAuth/Ads/CAPI | connection, launch, sync, conversion, deletion | OAuth/encrypted token/signed callbacks | Signed state and encryption observed. | Token in query URL, version/scope drift, deletion incomplete. | NOT_PROVEN |
| INT-003 | Twilio | lead alerts, inbound SMS, delivery status | server credentials + signature verification | Webhook signatures observed. | Single-org inbound mapping and retry/idempotency live truth unproven. | NOT_PROVEN |
| INT-004 | GoHighLevel | partner CRM contact/opportunity sync | partner/private integration configuration | Structured mapping and sync event tables. | Timeout/idempotency/mapping/retry gaps. | NOT_PROVEN |
| INT-005 | OpenAI-compatible AI | copy, strategy, image/vision QA | server API key/base/model | Bounded provider wrappers present. | Current provider behavior/spend not exercised. | NOT_PROVEN |
| INT-006 | Higgsfield | static/video/Marketing Studio generation | server API or local CLI | Media validation, execFile and reduced child env. | Worker deployment and temp cleanup gaps. | NOT_PROVEN |
| INT-007 | HeyGen | avatar/video generation | server API key/avatar/voice | Provider wrapper present. | No live contract proof. | NOT_PROVEN |
| INT-008 | ElevenLabs | voice generation | server API key/voice ID | Provider wrapper/config surface present. | No live contract proof. | NOT_PROVEN |
| INT-009 | Supabase | auth, Postgres, storage, service-role operations | browser/session/service-role | SSR context and RLS migrations present. | Live schema/RLS/tenant negatives not tested. | NOT_PROVEN |
| INT-010 | Freshdesk | support tickets | server API credential/domain | Server-side integration present. | No ticket created or live contract proof. | NOT_PROVEN |
| INT-011 | Cloudflare Turnstile | public abuse challenge | public site key + server secret | Challenge verification path present. | Bypass flags and fetch timeout concerns. | NOT_PROVEN |
| INT-012 | Vercel | serverless hosting, deployment, cron | project/deployment config | Public response markers and cron config observed. | Exact deployed commit/env and dedicated worker are unproven. | NOT_PROVEN |

## Configuration-name inventory

- 128 unique key names: 111 source-referenced and 93 .env.example names; 76 overlap, 35 source-only, 17 example-only.
- No value was read. Configured/enabled/account-ready state is NOT_PROVEN for every key.
- Source-only safety flags include lead load-test, QA auth/Stripe harness, Meta interruption, trusted origins, provider bases/models, and runtime deployment identifiers.
- Example-only names may be intentionally optional or stale; the audit does not infer which without an owner/typed contract.
- META OAuth version/scopes are split in source. Current provider compatibility requires authoritative verification before launch.

## Provider proof boundary

No provider auth, object creation, reconnect, webhook replay, SMS, CRM sync, generation, support ticket, billing session, or database mutation occurred. Source wrappers and configuration names are Tier C, never mislabeled as live contract proof.

