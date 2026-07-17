#!/usr/bin/env tsx

import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertExecutableMetaCampaignClaims,
  assertMetaCreativeClaims,
  assertPaidCreativeCampaignClaims,
  assertPublicFunnelClaims,
  assertStaticCreativeProviderClaims,
  assertVideoGenerationClaims,
} from "../src/lib/advertising-claim-boundaries";
import { AdvertisingClaimUnverifiedError } from "../src/lib/copy/claim-safety";

function neutralCampaign() {
  return {
    campaign: {
      id: "campaign-1",
      user_id: "user-1",
      organization_id: "organization-1",
      name: "Toronto campaign",
      location: "Toronto",
      audience: "homeowners",
      offer: "Personalized selling plan",
      price_point: null,
      market_type: "seller",
      funnel_goal: "lead_form",
      created_at: "2026-07-16T00:00:00.000Z",
      updated_at: "2026-07-16T00:00:00.000Z",
    },
    strategy: {
      location: "Toronto",
      audience: "homeowners",
      offer: "Personalized selling plan",
      market_type: "seller",
      funnel_goal: "lead_form",
    },
    plan: {
      intent: "seller",
      market: "Toronto",
      audience: "homeowners",
      offer: "Personalized selling plan",
      property_type: "home",
      business_name: "Example Realty",
      client_name: "Example Agent",
      primary_goal: "Discuss selling options",
      timeline: "When the homeowner is ready",
      mechanism: "Market review",
      creative_strategy: {},
      pain_points: [],
      monthly_budget: 900,
      daily_budget_cents: 3000,
      lead_capture_mode: "quality_funnel",
      language: "en",
      summary: "A local real estate campaign",
      targeting_summary: "Local homeowners",
      offer_summary: "Review a market-based home value and selling plan",
      funnel_type: "landing_page_form",
      funnel_steps: [],
    },
    funnel: {
      funnel_type: "landing_page_form",
      headline: "Review your home-selling options",
      subheadline: "Get a personalized plan based on your property and timing.",
      cta: "Request my plan",
      sections: [
        {
          id: "benefits-1",
          type: "benefits",
          variant: "default",
          title: "What the review covers",
          content: ["Local market context", "Practical next steps"],
          visible: true,
          style: {
            spacing: "comfortable",
            width: "content",
            align: "left",
            theme: "light",
          },
          media: null,
        },
      ],
      form_fields: ["name", "email", "phone"],
      follow_up_action: "send_to_follow_up_sequence",
      optimization_notes: [],
      customLeadFormQuestions: [],
    },
    creatives: {
      items: [],
      ideas: [
        {
          id: "idea-1",
          hook: "Thinking about selling?",
          angle: "authority",
          format: "ugc",
          concept: "Local selling-plan review",
          visual_direction: "Agent reviewing a neighborhood market report",
        },
      ],
      copy: [
        {
          id: "copy-1",
          campaign_id: "campaign-1",
          hook: "Thinking about selling?",
          primary_text: "Review your property, timeline, and local market options.",
          script: "Explore a personalized selling plan.",
          headline: "Build your selling plan",
          cta: "Learn more",
          created_at: "2026-07-16T00:00:00.000Z",
        },
      ],
      ads: [],
      staticAds: [],
      videoAds: [],
    },
    launch: { runtime: {} },
    results: { optimizations: [] },
    publish: {
      state: "draft",
      slug: null,
      stagedAt: null,
      publishedAt: null,
      hasStagedSnapshot: false,
      hasPublishedSnapshot: false,
    },
  } as any;
}

function expectClaimRejection(operation: () => unknown, label: string) {
  assert.throws(
    operation,
    (error: unknown) => {
      assert.ok(error instanceof AdvertisingClaimUnverifiedError, `${label} must use the stable claim error`);
      assert.equal(error.code, "advertising_claim_unverified");
      assert.equal(error.statusCode, 409);
      assert.ok(error.findings.length > 0);
      return true;
    },
    label,
  );
}

const neutral = neutralCampaign();
assert.doesNotThrow(() => assertPublicFunnelClaims(neutral));
assert.doesNotThrow(() => assertPaidCreativeCampaignClaims(neutral));
assert.doesNotThrow(() => assertStaticCreativeProviderClaims({
  creativeBrief: {
    keyOffer: "Personalized selling plan",
    hooks: ["Review your selling options"],
    visualDirection: "Agent reviewing a local market report",
  },
  staticAsset: {
    hook: "Thinking about selling?",
    headline: "Build your selling plan",
    primaryText: "Review your options based on your property and timeline.",
    cta: "Learn more",
    imagePrompt: "A real estate agent reviewing a local market report",
  },
}));
assert.doesNotThrow(() => assertVideoGenerationClaims({
  title: "Your local selling plan",
  hook: "Thinking about selling?",
  body: "Review your property, timing, and local options.",
  cta: "Learn more",
  scriptText: "Explore a personalized selling plan.",
  scenes: [{ text: "Agent reviewing a market report" }],
}));
assert.doesNotThrow(() => assertMetaCreativeClaims({
  primaryText: "Review homes that may fit your goals and budget.",
  headline: "Explore available homes",
}));
assert.doesNotThrow(() => assertMetaCreativeClaims({
  primaryText: "Examinez les options qui correspondent a vos objectifs.",
  headline: "Consultez les options disponibles",
}));
assert.doesNotThrow(() => assertMetaCreativeClaims({
  primaryText: "Revise opciones que se ajusten a sus objetivos.",
  headline: "Explore opciones disponibles",
}));

const unsafePublic = neutralCampaign();
unsafePublic.funnel.headline = "Sell your home in 90 days guaranteed";
expectClaimRejection(() => assertPublicFunnelClaims(unsafePublic), "unsafe legacy public funnel");

const unsafePaidDraft = neutralCampaign();
unsafePaidDraft.creatives.copy.push({
  ...unsafePaidDraft.creatives.copy[0],
  id: "legacy-copy",
  primary_text: "If it doesn't sell, you don't pay",
});
expectClaimRejection(
  () => assertPaidCreativeCampaignClaims(unsafePaidDraft),
  "unsafe unused paid-creative draft",
);

expectClaimRejection(() => assertStaticCreativeProviderClaims({
  creativeBrief: { keyOffer: "Personalized selling plan" },
  staticAsset: { imagePrompt: "Overlay: 10 leads for $5 per lead" },
}), "unsafe paid static provider payload");

expectClaimRejection(() => assertVideoGenerationClaims({
  title: "Seller video",
  scriptText: "We guarantee your home sells in 90 days or we'll buy it.",
}), "unsafe paid video provider payload");

expectClaimRejection(() => assertMetaCreativeClaims({
  primaryText: "Get approved today with no downside.",
  headline: "Guaranteed approval",
}), "unsafe Meta creative payload");

expectClaimRejection(() => assertExecutableMetaCampaignClaims({
  adSets: [{
    ads: [{
      copy: "Access off-market homes before everyone else.",
      headline: "Private inventory",
      cta: "Learn more",
      creativeAsset: { body: "Limited inventory" },
    }],
  }],
}), "unsafe legacy executable Meta campaign");

function read(relativePath: string) {
  return fs.readFileSync(relativePath, "utf8");
}

function functionSlice(source: string, start: string, end?: string) {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `Missing source boundary: ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1;
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

function assertBefore(source: string, gate: string, effects: string[], label: string) {
  const gateIndex = source.indexOf(gate);
  assert.ok(gateIndex >= 0, `${label}: missing gate ${gate}`);
  for (const effect of effects) {
    const effectIndex = source.indexOf(effect);
    assert.ok(effectIndex >= 0, `${label}: missing protected effect ${effect}`);
    assert.ok(gateIndex < effectIndex, `${label}: ${gate} must precede ${effect}`);
  }
}

const persistence = read("src/lib/services/campaign-persistence.ts");
assertBefore(
  functionSlice(persistence, "export async function updateCampaignPublishState", "export async function getPublishedCampaignBySlug"),
  "assertPublicFunnelClaims(currentRecord)",
  ["createAdminClient()", ".update(update as never)"],
  "public stage/publish",
);
assertBefore(
  functionSlice(persistence, "export async function regenerateStaticCreativeAssetsForUser", "export async function updateCampaignPublishState"),
  "assertPaidCreativeCampaignClaims(currentRecord)",
  ["startAssetGenerationLifecycle", "persistCampaignPlanDocumentUpdate", "generateStaticCreativeAds"],
  "paid static worker",
);

assertBefore(
  functionSlice(read("src/app/api/campaigns/[id]/generate-static-ads/route.ts"), "export async function POST"),
  "assertPaidCreativeCampaignClaims(campaign)",
  ["consumeRateLimit", "listSystemJobs", "createSystemJob"],
  "paid static route",
);
assertBefore(
  functionSlice(read("src/lib/ai/providers.ts"), "export async function createImageAd", "export async function createVideoAd"),
  "assertStaticCreativeProviderClaims({ creativeBrief, staticAsset })",
  ["providerUsage.reserve()", "imageProvider.execute"],
  "paid static provider",
);
assertBefore(
  functionSlice(read("src/app/api/campaigns/[id]/generate-video/route.ts"), "export async function POST"),
  "assertVideoGenerationClaims(payload)",
  ["createSystemJob"],
  "paid video route",
);
assertBefore(
  functionSlice(read("src/lib/services/video-generation-job.ts"), "export async function runVideoGenerationJob", "export async function pollVideoGenerationStatusJob"),
  "assertVideoGenerationClaims(params.payload)",
  ["persistVideoAdsToCampaignPlan", "consumeSessionCostBudget", "createDurableVideoRender"],
  "paid video worker",
);

assertBefore(
  functionSlice(read("src/app/api/campaigns/[id]/schedule-launch/route.ts"), "async function buildApprovalSnapshot", "async function resolveImmutableApprovalContract"),
  "assertMetaCreativeClaims({",
  ["resolveCreativeContentSha256", "buildMetaLaunchInputBinding"],
  "Meta schedule snapshot",
);
assertBefore(
  functionSlice(read("src/lib/meta-launch-input-snapshot.ts"), "export function buildMetaLaunchInputBinding"),
  "assertMetaCreativeClaims({",
  ["sha256(params.primaryText)", "sha256(params.headline)"],
  "immutable Meta launch snapshot",
);
assertBefore(
  functionSlice(read("src/app/api/campaigns/[id]/launch/route.ts"), "export async function POST"),
  "assertPaidCreativeCampaignClaims(record)",
  ["consumeRateLimit", "claimManualCampaignLaunch", "acquireMetaLaunchLock"],
  "manual Meta launch",
);
assertBefore(
  functionSlice(read("src/app/api/campaigns/create/route.ts"), "export async function launchCampaignToMeta", "export async function POST"),
  "assertMetaCreativeClaims({",
  ["resolveCreativeContentSha256", "ensureMetaInstantForm({", "armProviderMutation(\"campaign\""],
  "current Meta launch implementation",
);
assertBefore(
  functionSlice(read("src/lib/services/meta-launch-service.ts"), "export async function createMetaCreative", "export async function createMetaAd"),
  "assertMetaCreativeClaims({",
  ["assertMetaLiveWriteEnabled()", "createOrRecoverMetaObject"],
  "secondary Meta launch service",
);
assertBefore(
  functionSlice(read("src/lib/integrations/meta/execution.ts"), "async function createAdCreative", "export function mapCampaignToMetaPayload"),
  "assertMetaCreativeClaims({",
  ["if (params.mode === \"sandbox\")", "fetchMetaResponse"],
  "secondary Meta execution transport",
);
assertBefore(
  functionSlice(read("src/lib/services/campaign-execution-service.ts"), "export async function launchCampaignExecution", "export async function executeFullAutopilotLaunch"),
  "assertMetaLaunchAssetsClaimSafety(validatedCampaign)",
  ["getLaunchReadyCreativeMedia", "ensureMetaInstantForm({", "createMetaCampaign({"],
  "legacy campaign execution",
);
assertBefore(
  functionSlice(read("src/lib/services/meta-campaign-execution-service.ts"), "export async function prepareCampaignDeployment"),
  "assertExecutableMetaCampaignClaims(executableCampaign)",
  ["getMetaConnectionForExecution", "createCampaign({", "mapAdToMetaPayload("],
  "legacy Meta campaign execution",
);

const routeErrorSource = read("src/lib/api/route.ts");
assert.match(
  routeErrorSource,
  /error instanceof AdvertisingClaimUnverifiedError[\s\S]*apiFailure\(error\.message, error\.code, error\.statusCode/,
  "API routes must preserve the stable advertising_claim_unverified 409 contract",
);

console.log("Advertising claim boundary tests passed: runtime fail-closed checks and pre-effect source ordering.");
