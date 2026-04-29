#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;

function pass(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  failures += 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function includes(relativePath, pattern, name, detail) {
  const text = read(relativePath);
  const ok = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);

  if (ok) {
    pass(name, detail);
  } else {
    fail(name, `${relativePath} missing ${detail ?? String(pattern)}`);
  }
}

function orderedIncludes(relativePath, patterns, name, detail) {
  const text = read(relativePath);
  let offset = 0;

  for (const pattern of patterns) {
    const next = text.indexOf(pattern, offset);
    if (next === -1) {
      fail(name, `${relativePath} missing ordered marker "${pattern}"`);
      return;
    }

    offset = next + pattern.length;
  }

  pass(name, detail);
}

function assertNoUnscopedAdminWrite(relativePath, table, name) {
  const text = read(relativePath);
  const writePattern = new RegExp(`\\.from\\("${table}"\\)[\\s\\S]{0,220}\\.(update|delete)\\(`, "g");
  const matches = [...text.matchAll(writePattern)];

  for (const match of matches) {
    const slice = text.slice(match.index, match.index + 520);
    if (!slice.includes('.eq("user_id"') && !slice.includes('.eq("organization_id"')) {
      fail(name, `${relativePath} has ${table} ${match[1]} without nearby tenant predicate`);
      return;
    }
  }

  pass(name, `${relativePath} has tenant predicates near ${table} admin writes`);
}

includes(
  "src/lib/services/campaign-persistence.ts",
  ".or(`user_id.eq.${userId},owner_id.eq.${ownerId}`)",
  "Campaign read ownership",
  "campaign lookup is scoped to current user or owning organization",
);
includes(
  "src/lib/services/campaign-persistence.ts",
  '.eq("user_id", campaign.user_id)',
  "Campaign mutation ownership",
  "publish updates keep user_id predicate with service-role fallback",
);

includes(
  "src/lib/services/creative-builder-service.ts",
  '.eq("campaign_id", campaignId)\n      .eq("user_id", userId)',
  "Asset list ownership",
  "campaign asset listing requires campaign_id and current user_id",
);
includes(
  "src/lib/services/creative-builder-service.ts",
  'query = query.eq("user_id", userId)',
  "Asset detail ownership",
  "asset detail/delete helpers add current user_id when called from routes",
);
includes(
  "src/lib/services/creative-builder-service.ts",
  "const record = await getCampaignById(params.campaignId)",
  "Manual asset upload ownership",
  "manual upload verifies campaign ownership before insert",
);

includes(
  "src/lib/services/lead-handler-service.ts",
  '.eq("publish_state", "published")',
  "Public lead capture state guard",
  "public lead capture accepts only published funnels",
);
includes(
  "src/lib/services/lead-handler-service.ts",
  "resolveOrganizationIdForCampaignRow",
  "Lead tenant derivation",
  "lead writes derive organization from the campaign row instead of client input",
);

includes(
  "src/lib/integrations/meta/service.ts",
  '.eq("organization_id", organizationId)\n    .eq("platform", "meta_ads")',
  "Meta workspace ownership",
  "Meta record lookup is scoped by authenticated organization_id",
);
includes(
  "src/app/api/integrations/meta/selections/route.ts",
  "assertSameOriginRequest(request)",
  "Meta selection CSRF guard",
  "Meta selection mutation rejects cross-site writes",
);
includes(
  "src/app/api/integrations/meta/selections/route.ts",
  "await getAuthenticatedContext()",
  "Meta selection auth guard",
  "Meta selection route requires authenticated app context",
);

orderedIncludes(
  "src/lib/services/system-job-service.ts",
  [
    '.eq("idempotency_key", params.idempotencyKey.trim())',
    '.eq("organization_id", params.organizationId)',
    '.eq("user_id", params.userId)',
  ],
  "System job idempotency scope",
  "idempotency recovery cannot return another tenant's job",
);
includes(
  "src/lib/services/system-job-service.ts",
  '.eq("user_id", params.userId)',
  "System job list ownership",
  "job lists are scoped to current user_id",
);
includes(
  "src/app/api/system-jobs/[id]/stream/route.ts",
  "getSystemJob(jobId, auth.userId)",
  "System job stream ownership",
  "stream route loads job by id plus current user_id",
);
includes(
  "src/app/api/system-jobs/[id]/stream/route.ts",
  "getSystemJobLogs(job.id, auth.userId)",
  "System job log stream ownership",
  "stream route passes current user into log retrieval",
);

includes(
  "src/lib/services/billing-service.ts",
  "assertBillingFeatureAccess",
  "Billing read access helper",
  "billing access is centralized before user-visible billing state",
);
includes(
  "src/lib/services/billing-service.ts",
  "assertMetaLaunchBillingAccess",
  "Meta launch billing gate",
  "Meta launch uses a dedicated billing authorization helper",
);

assertNoUnscopedAdminWrite(
  "src/lib/services/campaign-persistence.ts",
  "campaign_plans",
  "Campaign admin writes",
);
orderedIncludes(
  "src/lib/services/system-job-service.ts",
  [
    "export async function retrySystemJob(jobId: string, userId: string)",
    "const currentJob = await getSystemJob(jobId, userId)",
    "if (!currentJob)",
    "const nextJob = await updateSystemJob(supabase, jobId",
  ],
  "System job retry ownership",
  "user-triggered job retry verifies job ownership before service-role update",
);

if (failures > 0) {
  process.exitCode = 1;
}
