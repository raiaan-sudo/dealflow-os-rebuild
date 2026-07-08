import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const migrations = readdirSync("supabase/migrations")
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(`supabase/migrations/${file}`, "utf8"))
  .join("\n");
const crossTenant = readFileSync("scripts/check-rls-cross-tenant.mjs", "utf8");

assert.match(migrations, /enable row level security/i, "migrations must enable RLS");
assert.match(migrations, /force row level security/i, "migrations must force RLS where tenant tables require it");
assert.match(crossTenant, /organization_id|tenant_id/, "cross-tenant checker must assert organization/tenant isolation");
assert.match(crossTenant, /cannot|forbid|reject|denied|different/i, "cross-tenant checker must prove denied access cases");

console.log("RLS fixture/static contract passed.");
