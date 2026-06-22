#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const routeSource = fs.readFileSync("src/app/api/internal/provider-static-generation-proof/route.ts", "utf8");
const routeSecuritySource = fs.readFileSync("scripts/check-route-security.mjs", "utf8");

assert.match(routeSource, /assertInternalSystemRequest\(request\)/, "proof route must require internal bearer auth");
assert.match(routeSource, /PROVIDER_STATIC_GENERATION_PROOF_ENABLED/, "proof route must be disabled by env gate by default");
assert.match(routeSource, /assertProviderGenerationHardCapsConfigured/, "proof route must require hard cap preflight");
assert.match(routeSource, /consumeSessionCostBudget/, "proof route must reserve provider usage before generation");
assert.match(routeSource, /markSessionCostBudgetEvent/, "proof route must finalize provider usage ledger events");
assert.match(routeSource, /max_static_image_generations:\s*1/, "proof route must cap static generation at one asset");
assert.match(routeSource, /videoGenerationAttempted:\s*false/, "proof route must explicitly report no video generation");
assert.match(routeSource, /batchGeneration:\s*false/, "proof route must explicitly report no batch generation");
assert.match(routeSource, /createdRealLead:\s*false/, "proof route must not create public leads");
assert.match(routeSource, /createdSystemJob:\s*false/, "proof route must not create system jobs");
assert.match(routeSource, /smsEmailSent:\s*false/, "proof route must not send SMS or email");
assert.match(routeSource, /metaMutation:\s*false/, "proof route must not mutate Meta");
assert.match(routeSource, /ghlMutation:\s*false/, "proof route must not mutate GHL");
assert.match(routeSource, /stripeBillingProviderAction:\s*false/, "proof route must not touch Stripe or billing");
assert.match(routeSource, /tokensExposed:\s*false/, "proof route must not expose provider tokens");
assert.match(routeSource, /credentialRefsExposed:\s*false/, "proof route must not expose credential references");
assert.match(routeSource, /provider_cap_exceeded_missing_baseline/, "cap exceeded proof must require a prior one-asset baseline");
assert.match(routeSource, /provider_static_proof_cap_not_one/, "live proof must require daily and request image caps of one");
assert.doesNotMatch(routeSource, /generateVideo|generateVideoAd|createAvatar|ALLOW_HIGGSFIELD_VIDEO_GENERATION\s*=\s*"true"/, "proof route must not invoke video generation");
assert.doesNotMatch(routeSource, /safeSyncLeadToPartnerCrm|GHL_CONTACT_WRITES_ENABLED|GHL_OPPORTUNITY_WRITES_ENABLED|sendSms|twilio|stripe\.checkout|createCheckout|graph\.facebook/i, "proof route must not touch GHL, SMS, Stripe, or Meta side effects");

assert.match(routeSecuritySource, /\/api\/internal\/provider-static-generation-proof/, "route security scanner must know the proof route");
assert.match(routeSecuritySource, /PROVIDER_STATIC_GENERATION_PROOF_ENABLED/, "route security scanner must require proof env marker");
assert.match(routeSecuritySource, /maxStaticAssetProviderCalls: 1/, "route security scanner must require one-call marker");

console.log("PASS provider static generation proof harness assertions");
