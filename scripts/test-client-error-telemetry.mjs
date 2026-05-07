#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const migration = read("supabase/migrations/20260504223000_create_client_error_events.sql");
const route = read("src/app/api/client-errors/route.ts");
const listener = read("src/components/telemetry/client-error-listener.tsx");
const layout = read("src/app/layout.tsx");
const appError = read("src/app/(app)/error.tsx");
const authError = read("src/app/(auth)/error.tsx");
const service = read("src/lib/services/client-error-telemetry-service.ts");
const monitor = read("src/lib/services/internal-launch-monitor.ts");
const proxy = read("src/proxy.ts");
const routeSecurity = read("scripts/check-route-security.mjs");

assert.match(migration, /create table if not exists public\.client_error_events/);
assert.match(migration, /force row level security/);
assert.match(migration, /client_error_events_service_role_all/);
assert.match(migration, /event_key text not null/);
assert.match(migration, /reviewed_at timestamptz null/);

assert.match(route, /assertSameOriginRequest/);
assert.match(route, /consumeRateLimit/);
assert.match(route, /recordClientErrorEvent/);
assert.match(route, /client_error_body_too_large/);

assert.match(listener, /window\.addEventListener\("error"/);
assert.match(listener, /window\.addEventListener\("unhandledrejection"/);
assert.match(listener, /\/api\/client-errors/);
assert.match(listener, /sessionStorage/);
assert.match(layout, /<ClientErrorListener \/>/);
assert.match(appError, /app_error_boundary/);
assert.match(authError, /auth_error_boundary/);

assert.match(service, /FORBIDDEN_TEXT_PATTERN/);
assert.match(service, /FORBIDDEN_METADATA_KEY/);
assert.match(service, /client_error_events/);
assert.match(service, /loadClientErrorIssues/);
assert.match(monitor, /source: "client_error"/);
assert.match(proxy, /"\/api\/client-errors"/);
assert.match(routeSecurity, /\["\/api\/client-errors", new Set\(\["POST"\]\)\]/);

console.log("PASS client error telemetry assertions");
