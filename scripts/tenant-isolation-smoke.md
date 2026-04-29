# Tenant isolation smoke checks

Use two authenticated users in different organizations: User A owns Campaign A and User B owns Campaign B.
Run these after applying migrations in a staging project with realistic auth cookies.

## Automated RLS proof

Run `npm run rls:cross-tenant` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RLS_USER_A_JWT`, `RLS_USER_B_JWT`, and at least one row pair such as `RLS_CAMPAIGN_A_ID` plus `RLS_CAMPAIGN_B_ID`.
Optional row-pair groups: `RLS_ORG_A_ID`/`RLS_ORG_B_ID`, `RLS_CAMPAIGN_A_ID`/`RLS_CAMPAIGN_B_ID`, `RLS_LEAD_A_ID`/`RLS_LEAD_B_ID`, and `RLS_SYSTEM_JOB_A_ID`/`RLS_SYSTEM_JOB_B_ID`.
The script expects each owner token to read its own row, the opposite token to receive zero rows, and anon/authenticated callers to be denied access to the internal rate-limit RPC.

## Campaigns and assets

1. As User A, request `GET /api/campaigns/<campaign-b-id>` and confirm `404`.
2. As User A, request `POST /api/campaigns/<campaign-b-id>/assets` with a valid file and same-origin headers. Confirm `404` or `403`, and confirm no `creative_assets` row exists for User A under Campaign B.
3. As User A, request `GET /api/assets/<asset-b-id>` and `DELETE /api/assets/<asset-b-id>`. Confirm `404`.
4. As User A, request `POST /api/campaigns/<campaign-b-id>/select-ad` with a valid creative id. Confirm denial and no selected creative changes on Campaign B.

## Leads and public funnels

1. Keep Campaign B unpublished and submit `POST /api/lead-capture` using Campaign B's raw id. Confirm rejection.
2. Publish Campaign B, submit a valid public lead through `/f/<campaign-b-slug>`, and confirm the lead is stored with Campaign B's `user_id` and `organization_id`; no client-supplied tenant fields should be accepted.
3. Submit the same contact twice and confirm dedupe applies within the Campaign B tenant only.

## Meta selections and jobs

1. As User A, call `POST /api/integrations/meta/selections` with User B's ad account/page/pixel identifiers. Confirm the response does not expose or persist User B's Meta selection.
2. Create or locate a system job for User B. As User A, request `GET /api/system-jobs/<job-b-id>/stream`. Confirm the streamed payload reports `job: null` and no logs.
3. Queue two jobs with the same idempotency key under User A and User B. Confirm User A never receives User B's existing job record; a collision may fail because the database key is globally unique, but it must not leak the other tenant's job.

## Billing-adjacent access

1. As User A, request billing state and Meta launch for Campaign B. Confirm subscription state and launch eligibility are resolved only for User A's authenticated context, not Campaign B's owner.
2. Confirm webhook-only subscription mutations are still service-role/internal paths and are not callable by authenticated users.
