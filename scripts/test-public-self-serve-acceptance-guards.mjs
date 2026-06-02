import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function listFiles(directory) {
  const entries = fs.readdirSync(path.join(root, directory), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if ([".next", ".git", "node_modules"].includes(entry.name)) return [];
      return listFiles(relativePath);
    }
    return [relativePath];
  });
}

const signupPage = "src/app/signup/page.tsx";
const proxy = read("src/proxy.ts");
const appLayout = read("src/app/(app)/layout.tsx");
const builderPage = read("src/app/(app)/builder/page.tsx");
const unlockPage = read("src/app/(app)/unlock/page.tsx");
const creativeIntake = read("src/app/(app)/build/creatives/creative-chat-intake.tsx");
const previewPage = read("src/app/(app)/preview/page.tsx");
const launchPage = read("src/app/(app)/launch/page.tsx");
const selectAdRoute = read("src/app/api/campaigns/[id]/select-ad/route.ts");

assert.equal(exists(signupPage), true, "/signup route must exist");
assert.match(read(signupPage), /mode:\s*"sign-up"/, "/signup must preserve canonical sign-up mode");
assert.match(read(signupPage), /redirect\(`\/login\?\$\{target\.toString\(\)\}`\)/, "/signup must redirect to /login");
assert.match(proxy, /"\/signup"/, "/signup must be public before auth middleware redirects");
assert.match(appLayout, /resolveOwnedActiveCampaignId/, "app layout must validate active campaign cookies before scoping navigation");
assert.match(appLayout, /getCampaignById\(candidateCampaignId\)\.catch\(\(\) => null\)/, "stale or cross-user active campaign cookies must fail closed");
assert.doesNotMatch(appLayout, /const activeCampaignId = cookieStore\.get\(ACTIVE_CAMPAIGN_COOKIE\)\?\.value \?\? null;/, "app layout must not trust raw active campaign cookie values");

const customerFacingSignupLinkFiles = [
  "src/app/page.tsx",
  "src/app/login/page.tsx",
  "src/app/(app)/layout.tsx",
  "src/app/(app)/onboarding/page.tsx",
  "src/app/(app)/paywall/page.tsx",
  "src/app/(app)/unlock/page.tsx",
  "src/app/(app)/welcome/page.tsx",
  "src/app/(app)/builder/page.tsx",
  "src/app/(app)/build/creatives/page.tsx",
  "src/app/(app)/preview/page.tsx",
  "src/app/(app)/launch/page.tsx",
  "src/app/(app)/dashboard/page.tsx",
].filter(exists);

const deadSignupLinks = customerFacingSignupLinkFiles
  .filter((file) => /\.(tsx?|jsx?)$/.test(file))
  .filter((file) => file !== signupPage)
  .filter((file) => /href=["']\/signup["']|href=\{["']\/signup["']\}/.test(read(file)));
assert.deepEqual(deadSignupLinks, [], "public/source CTAs must not point at a dead /signup route");

assert.equal(exists("src/components/campaign/creative-auto-prepare.tsx"), false, "navigation must not mount an auto provider preparation component");
assert.doesNotMatch(builderPage, /CreativeAutoPrepare|generate-static-ads/, "builder navigation must not auto-call static generation");
assert.doesNotMatch(unlockPage, /CreativeAutoPrepare|generate-static-ads/, "unlock navigation must not auto-call static generation");
assert.doesNotMatch(creativeIntake, /generate-static-ads|generate-video/, "creative intake render must not directly queue provider work");

assert.match(previewPage, /ReviewOnlyCreativePreview/, "preview must expose a review-only acceptance fallback");
assert.match(previewPage, /cannot satisfy Meta launch gates/, "review-only preview copy must state it cannot satisfy launch gates");
assert.doesNotMatch(previewPage, /selectedAds\.length\s*===\s*0[\s\S]{0,120}redirect\(/, "preview must not redirect fresh campaigns back to Creative Intake solely because no selected creatives exist");
assert.doesNotMatch(previewPage, /generate-static-ads|generate-video/, "preview render must not queue provider generation");
assert.match(previewPage, /mediaReadyForLaunch\s*=\s*selectedStaticMediaReady/, "preview media readiness must be driven by the static launch set");
assert.doesNotMatch(previewPage, /mediaReadyForLaunch\s*=\s*selectedStaticMediaReady\s*&&\s*videoMediaReady/, "preview must not require optional UGC/video for launch review");
assert.match(previewPage, /UGC video is optional and can be added later/, "preview must label missing UGC as optional");

assert.match(launchPage, /Saved creative set missing/, "launch must still block when no saved creative set exists");
assert.match(launchPage, /selectedCreativeMediaReady/, "launch must keep selected creative media readiness gate");
assert.doesNotMatch(launchPage, /Approve a campaign-specific UGC video before launch|render or approve a campaign-specific UGC video before launch/i, "launch must not block on optional UGC/video");
assert.match(launchPage, /Optional UGC video/, "launch must present UGC as optional");
assert.doesNotMatch(read("src/app/api/campaigns/create/route.ts"), /selectedUgcVideoIds\.length === 0/, "actual launch creation must not require optional UGC/video");
assert.match(read("src/app/api/campaigns/create/route.ts"), /selectedUgcVideoIds\.length > 0/, "selected UGC videos must still be validated when present");
assert.match(launchPage, /Open Creative Studio/, "launch missing-creative CTA copy must match the Creative Studio target");
assert.match(launchPage, /\/build\/creatives\?campaignId=/, "launch missing-creative CTA must return to Creative Studio");
assert.doesNotMatch(launchPage, /\/builder\?campaignId=\$\{encodeURIComponent\(savedRecord\.campaign\.id\)\}/, "launch missing-creative CTA must not send users back to the generic builder");
assert.match(selectAdRoute, /!ad\s*\|\|\s*!isLaunchReadyStaticCreative\(ad,/, "review-only or placeholder static media must not be selectable for launch");
assert.match(selectAdRoute, /selected_static_minimum_not_met/, "launch selection must still require the static creative floor");
assert.match(selectAdRoute, /mergeCreativeAssetsIntoPlan/, "saving launch media must hydrate campaign plan creatives from durable creative assets");
assert.match(selectAdRoute, /currentPlanHasSelectedStaticAssets\s*&&[\s\S]{0,240}existingSelectedAdIds\.length/, "unchanged selection short-circuit must only run after selected static assets are present in the plan");

console.log("Public self-serve acceptance guards passed.");
