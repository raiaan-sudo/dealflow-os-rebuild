# DealFlow OS Performance Suite

This suite is intentionally guarded. It defaults to local/staging and refuses production-looking URLs unless `STRESS_TEST_ALLOW_PROD=true` is set.

## Required Environment

- `BASE_URL`: staging/local target URL.
- `STRESS_TEST_MODE=true`: required guard for every k6 script.

## Required For Lead Writes

- `STRESS_TEST_ALLOW_WRITES=true`
- `SMS_MOCK_MODE=true` or `TEST_SMS_MODE=mock`
- `TEST_CAMPAIGN_ID` or `TEST_FUNNEL_ID`

Do not run write tests against production unless a QA campaign is isolated, SMS is mocked, and `STRESS_TEST_ALLOW_PROD=true` is intentionally set.

## Optional Environment

- `VUS`: override virtual users.
- `DURATION`: override test duration.
- `TEST_AUTH_TOKEN`: normal test-user token for authenticated scripts. Never use service-role keys.

## Install k6

macOS:

```bash
brew install k6
```

## Commands

Smoke:

```bash
BASE_URL=https://staging.example.com STRESS_TEST_MODE=true STRESS_TEST_ALLOW_WRITES=true SMS_MOCK_MODE=true TEST_CAMPAIGN_ID=<qa-campaign-id> k6 run tests/performance/smoke.lead-capture.js
```

Load:

```bash
BASE_URL=https://staging.example.com STRESS_TEST_MODE=true STRESS_TEST_ALLOW_WRITES=true SMS_MOCK_MODE=true TEST_CAMPAIGN_ID=<qa-campaign-id> k6 run tests/performance/load.lead-capture.js
```

Stress:

```bash
BASE_URL=https://staging.example.com STRESS_TEST_MODE=true STRESS_TEST_ALLOW_WRITES=true SMS_MOCK_MODE=true TEST_CAMPAIGN_ID=<qa-campaign-id> k6 run tests/performance/stress.lead-capture.js
```

Spike:

```bash
BASE_URL=https://staging.example.com STRESS_TEST_MODE=true STRESS_TEST_ALLOW_WRITES=true SMS_MOCK_MODE=true TEST_CAMPAIGN_ID=<qa-campaign-id> k6 run tests/performance/spike.lead-capture.js
```

Soak:

```bash
BASE_URL=https://staging.example.com STRESS_TEST_MODE=true STRESS_TEST_ALLOW_WRITES=true SMS_MOCK_MODE=true TEST_CAMPAIGN_ID=<qa-campaign-id> k6 run tests/performance/soak.lead-capture.js
```

Dashboard:

```bash
BASE_URL=https://staging.example.com STRESS_TEST_MODE=true k6 run tests/performance/dashboard.load.js
```

Twilio status callback noise:

```bash
BASE_URL=https://staging.example.com STRESS_TEST_MODE=true k6 run tests/performance/sms-webhook.load.js
```

## Database Verification SQL

Run server-side only. Do not expose service-role keys to k6.

```sql
select count(*) as test_leads
from leads
where utm_source = 'k6'
  and utm_campaign = 'pre_launch';

select count(*) as assignments
from lead_assignments la
join leads l on l.id = la.lead_id
where l.utm_source = 'k6'
  and l.utm_campaign = 'pre_launch';

select purpose, status, count(*)
from lead_notifications ln
join leads l on l.id = ln.lead_id
where l.utm_source = 'k6'
  and l.utm_campaign = 'pre_launch'
group by purpose, status
order by purpose, status;

select lead_id, count(*) as duplicate_assignments
from lead_assignments
group by lead_id
having count(*) > 1;

select tenant_id, lead_id, agent_id, purpose, count(*) as duplicate_notifications
from lead_notifications
where agent_id is not null
group by tenant_id, lead_id, agent_id, purpose
having count(*) > 1;
```

## Launch Gates

- Lead submit p95 `< 750ms` under expected load.
- Lead submit p99 `< 1500ms` under expected load.
- Dashboard p95 `< 2000ms`.
- Error rate `< 1%` under expected load.
- Zero dropped lead records.
- Zero duplicate assignments.
- Zero duplicate SMS notification records for the same lead + agent + purpose.
- SMS failures must not fail lead creation.

