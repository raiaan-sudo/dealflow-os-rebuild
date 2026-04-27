# Required DB Migration Deployment Checklist

1. Apply all SQL migrations in `/supabase/migrations` before deploying app code.
2. Confirm `public.app_schema_metadata` exists and `schema_version=20260426`.
3. Confirm `public.campaign_plans` contains:
   - `launch_status`
   - `lead_loop_verified`
4. Run:
   - `npm run schema:check`
   - `npm run build`
5. Only then promote the release.

Runtime behavior:
- `SCHEMA_VALIDATION_MODE=block`:
  - startup validation throws and the server should fail fast
- `SCHEMA_VALIDATION_MODE=warn`:
  - startup validation logs a critical warning but allows degraded startup

Recommended production setting:
- `SCHEMA_VALIDATION_MODE=block`
