import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260512010000_scope_provider_usage_idempotency.sql",
  "utf8",
);

assert.match(migration, /drop index if exists public\.provider_usage_events_idempotency_unique/);
assert.match(migration, /provider_usage_events_scoped_idempotency_unique/);
assert.match(migration, /organization_id,\s*\n\s*user_id,\s*\n\s*coalesce\(campaign_id/s);
assert.match(migration, /where idempotency_key = p_idempotency_key\s*\n\s*and organization_id = p_organization_id/s);
assert.match(migration, /and user_id = p_user_id/);
assert.match(migration, /and provider = p_provider\s*\n\s*and operation = p_operation\s*\n\s*and usage_date = today/s);
assert.doesNotMatch(
  migration,
  /from public\.provider_usage_events\s*\n\s*where idempotency_key = p_idempotency_key;\s*\n/s,
  "provider usage idempotency lookup must not be globally scoped",
);

console.log("Provider usage idempotency scope tests passed.");
