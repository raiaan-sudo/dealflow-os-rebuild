import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import canonicalTemplate from "../config/authority/dealflow-owner-decisions.v1.json";
import {
  evaluatePlatformAdminAuthority,
} from "../src/lib/authority/owner-decision-authority-contract";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

assert.deepEqual(
  evaluatePlatformAdminAuthority({ authority: canonicalTemplate }),
  {
    authorized: false,
    capability: "platform_admin_security_surface",
    reason: "authority_not_verified",
  },
  "the tracked unsigned template can never expose the platform-admin surface",
);
assert.equal(
  evaluatePlatformAdminAuthority({
    authority: {
      authorized: true,
      capability: "platform_admin_security_surface",
      packetDigest: "a".repeat(64),
    },
  }).reason,
  "authority_not_verified",
  "a JSON-shaped or environment-created authority cannot cross the verification boundary",
);

const service = read("src/lib/services/platform-operator-authority-service.ts");
const reader = read("src/lib/authority/owner-decision-authority.ts");
const internalGuard = read("src/lib/services/internal-launch-monitor.ts");
const layout = read("src/app/(app)/layout.tsx");
const revokeRoute = read("src/app/api/admin/access-keys/[id]/revoke/route.ts");
const operatorMigration = read("supabase/migrations/20260717030000_harden_platform_operator_authority.sql");
const authorityMigration = read("supabase/migrations/20260717060000_install_owner_decision_authority_grants.sql");

assert.doesNotMatch(internalGuard, /isInternalAdminEmail|INTERNAL_ADMIN_EMAILS/);
assert.doesNotMatch(layout, /isInternalAdminEmail|INTERNAL_ADMIN_EMAILS/);
assert.match(internalGuard, /authorizePlatformOperatorAccess/);
assert.match(layout, /canExposePlatformOperatorNavigation/);
assert.match(revokeRoute, /requiredAction:\s*"access_keys:revoke"/);
assert.match(service, /await readPlatformAdminAuthority\(\)/);
assert.match(service, /getAuthenticatorAssuranceLevel/);
assert.match(service, /claimsAssurance !== "aal2"/);
assert.match(service, /ageSeconds > 10 \* 60/);
assert.match(service, /authorize_platform_operator_access_v1/);
assert.match(service, /check_platform_operator_navigation_v1/);
assert.match(reader, /resolve_owner_decision_authority_v1/);
assert.match(reader, /LOOKUP_TIMEOUT_MS = 750/);
assert.match(reader, /p_host_project_id_sha256/);
assert.doesNotMatch(reader, /DEALFLOW_OWNER_DECISION_AUTHORITY_PATH/);
assert.match(operatorMigration, /platform_operator_receipt_immutable/);
assert.match(operatorMigration, /environment <> 'production' or authority_mode = 'externally_signed'/);
assert.match(authorityMigration, /revoke all on table public\.owner_decision_authority_grants[\s\S]*anon, authenticated, service_role/);
assert.match(authorityMigration, /environment, capability, generation/);
assert.match(authorityMigration, /pg_advisory_xact_lock/);
assert.match(authorityMigration, /host_project_id_sha256/);
assert.match(authorityMigration, /grant_row\.generation = \([\s\S]*max\(latest\.generation\)/);

console.log(
  "platform operator authority contract: PASS (unsigned shape denied; async bounded DB-owner grant, exact host/candidate, AAL2, role/action, and receipt fences wired)",
);
