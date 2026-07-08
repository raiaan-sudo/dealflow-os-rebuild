#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const campaignsRoute = fs.readFileSync("src/app/api/campaigns/route.ts", "utf8");
const generateFunnelRoute = fs.readFileSync("src/app/api/generate-funnel/route.ts", "utf8");
const persistence = fs.readFileSync("src/lib/services/campaign-persistence.ts", "utf8");
const planPersistence = fs.readFileSync("src/lib/services/campaign-plan-persistence-service.ts", "utf8");
const canonicalCampaign = fs.readFileSync("src/lib/services/canonical-campaign.ts", "utf8");
const publicBuilder = fs.readFileSync("src/lib/public-funnel/canonical-public-funnel.ts", "utf8");

assert.match(campaignsRoute, /const normalizedPayload = normalizeCampaignPayload\(body\)/, "POST /api/campaigns must normalize caller payload");
assert.match(campaignsRoute, /saveCampaign\(normalizedPayload\)/, "POST /api/campaigns must persist through saveCampaign");
assert.match(persistence, /publicFunnel: buildCanonicalPublicFunnel\(canonical\)/, "saveCampaign must attach canonical publicFunnel");
assert.match(persistence, /publicFunnelPresetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION/, "saveCampaign must attach publicFunnelPresetVersion");

assert.match(generateFunnelRoute, /publicFunnel: buildCanonicalPublicFunnel/, "/api/generate-funnel must attach canonical publicFunnel");
assert.match(generateFunnelRoute, /publicFunnelPresetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION/, "/api/generate-funnel must attach publicFunnelPresetVersion");
assert.match(generateFunnelRoute, /sections: funnel\.sections/, "/api/generate-funnel must preserve internal draft sections");

assert.match(persistence, /attachCanonicalPublicFunnel\(record as unknown as Record<string, unknown>\)/, "publish snapshot builder must attach canonical public funnel");
assert.match(persistence, /staged_snapshot = snapshot/, "staging publish state must write the canonical snapshot");
assert.match(persistence, /published_snapshot = snapshot/, "published state must write the canonical snapshot");

assert.match(planPersistence, /public_funnel_preset_version/, "campaign plan persistence must preserve public_funnel_preset_version");
assert.match(planPersistence, /public_funnel/, "campaign plan persistence must preserve public_funnel");
assert.match(canonicalCampaign, /publicFunnelPresetVersion/, "canonical campaign normalization must preserve publicFunnelPresetVersion");
assert.match(canonicalCampaign, /publicFunnel:/, "canonical campaign normalization must preserve publicFunnel");

assert.match(publicBuilder, /collectBlockedSectionTypes/, "canonical builder must detect caller-provided banned sections");
assert.match(publicBuilder, /validateCanonicalPublicFunnel\(funnelModel\)/, "canonical builder must validate before returning");

console.log("campaign public funnel path checks passed");

