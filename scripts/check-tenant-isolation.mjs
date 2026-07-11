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
  '.eq("organization_id", organizationId)',
  "Campaign read ownership",
  "campaign lookup is scoped to the active workspace organization",
);
includes(
  "src/lib/services/campaign-persistence.ts",
  '.eq("organization_id", row.organization_id)',
  "Campaign mutation ownership",
  "publish updates keep the immutable workspace predicate on service-role writes",
);
orderedIncludes(
  "src/lib/services/video-generation-job.ts",
  [
    "async function loadCampaignPlanRow(",
    '.eq("id", campaignId)',
    '.eq("organization_id", organizationId)',
    '.eq("user_id", userId)',
  ],
  "Video campaign worker ownership",
  "video generation workers require campaign id, exact organization, and actor user",
);
orderedIncludes(
  "src/lib/services/video-generation-job.ts",
  ['.eq("id", params.assetId)', '.eq("campaign_id", params.campaignId)', '.eq("user_id", params.userId)'],
  "Video status asset ownership",
  "video status jobs bind an asset to the exact campaign and actor before mutation",
);

orderedIncludes(
  "src/lib/services/creative-builder-service.ts",
  ["await getCampaignById(campaignId)", '.eq("campaign_id", campaignId)'],
  "Asset list ownership",
  "campaign asset listing verifies active-workspace campaign access before listing by campaign",
);
includes(
  "src/lib/services/creative-builder-service.ts",
  "const authorizedCampaignRecord = await getCampaignById(asset.campaign_id)",
  "Asset detail ownership",
  "asset detail verifies the parent campaign in the active workspace",
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
  "scripts/check-rls-cross-tenant.mjs",
  "RLS_USER_A_JWT",
  "Executable cross-tenant RLS smoke",
  "script can prove User A cannot read User B rows with authenticated Supabase REST tokens",
);
includes(
  "scripts/check-rls-cross-tenant.mjs",
  "/rest/v1/rpc/consume_rate_limit_bucket",
  "Internal RPC permission smoke",
  "script verifies public/authenticated callers cannot execute internal rate-limit RPC",
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
  'query.eq("organization_id", params.organizationId)',
  "System job list ownership",
  "job lists are scoped to the active organization",
);
includes(
  "src/app/api/system-jobs/[id]/stream/route.ts",
  "getSystemJob(jobId, actor)",
  "System job stream ownership",
  "stream route loads job by id plus the active organization actor",
);
includes(
  "src/app/api/system-jobs/[id]/stream/route.ts",
  "getSystemJobLogs(job.id, actor)",
  "System job log stream ownership",
  "stream route passes active organization scope into log retrieval",
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
    "export async function retrySystemJob(",
    "const currentJob = await getSystemJob(jobId, actor)",
    "if (!currentJob)",
    "const nextJob = await updateSystemJob(supabase, jobId",
  ],
  "System job retry ownership",
  "user-triggered job retry verifies job ownership before service-role update",
);

if (failures > 0) {
  process.exitCode = 1;
}
