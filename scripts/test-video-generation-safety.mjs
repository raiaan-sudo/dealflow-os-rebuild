import assert from "node:assert/strict";
import fs from "node:fs";

const videoRoute = fs.readFileSync("src/app/api/campaigns/[id]/generate-video/route.ts", "utf8");
const videoJob = fs.readFileSync("src/lib/services/video-generation-job.ts", "utf8");
const systemJobService = fs.readFileSync("src/lib/services/system-job-service.ts", "utf8");
const avatarProvider = fs.readFileSync("src/lib/integrations/creative/avatar-provider.ts", "utf8");
const higgsfield = fs.readFileSync("src/lib/ai/higgsfield.ts", "utf8");
const storageNormalization = fs.readFileSync("src/lib/services/static-creative-storage-normalization.ts", "utf8");
const creativeBuilder = fs.readFileSync("src/lib/services/creative-builder-service.ts", "utf8");
const resolveDebt = fs.readFileSync("scripts/resolve-known-operator-debt.mjs", "utf8");
const creativeWizard = fs.readFileSync("src/app/(app)/build/creatives/creative-wizard.tsx", "utf8");
const previewPage = fs.readFileSync("src/app/(app)/preview/page.tsx", "utf8");
const videoErrors = fs.readFileSync("src/lib/ai/video-generation-errors.ts", "utf8");

assert.match(videoRoute, /getVideoProviderReadiness/, "video route preflights provider readiness");
assert.ok(
  videoRoute.indexOf("if (!videoProviderReadiness.ready)") < videoRoute.indexOf("const activeJobs"),
  "video route blocks disabled/unconfigured providers before job lookup/queue",
);
assert.doesNotMatch(videoRoute, /processSystemJob/, "video route remains enqueue-only");

assert.match(systemJobService, /providerUsageRunId: `\$\{processingJob\.id\}:\$\{processingJob\.attempt_count \?\? 0\}`/, "video provider usage idempotency is scoped to the claimed job attempt");
assert.match(videoJob, /providerUsageRunId/, "video generation accepts a provider usage run id");
assert.match(videoJob, /isAppOwnedCreativeAssetUrl/, "video generation requires an app-owned source static creative");
assert.match(videoJob, /sourceStaticAssetId/, "video provider metadata preserves source static creative id internally");
assert.match(videoJob, /normalizeGeneratedVideoProviderFile/, "completed videos normalize into app-owned storage");
assert.match(videoJob, /status: "released"[\s\S]{0,240}providerJobCreated: false/, "pre-provider failures release provider usage instead of creating failed debt");
assert.match(videoJob, /status: "failed"[\s\S]{0,240}failureMode: "provider_start_failed"/, "failed provider starts are non-ready customer states");
assert.doesNotMatch(videoJob, /error_message: params\.message/, "video failure persistence does not write nonexistent creative_assets.error_message");
assert.match(videoJob, /SAFE_VIDEO_FAILURE_MESSAGE/, "customer-facing video failure copy is centralized and safe");

assert.match(higgsfield, /HIGGSFIELD_IMAGE_TO_VIDEO_ENDPOINT = "\/v1\/image2video\/dop"/, "Higgsfield video uses supported image-to-video endpoint");
assert.match(higgsfield, /input_images/, "Higgsfield video sends source image input");
assert.match(higgsfield, /inputImageUrl/, "Higgsfield video request requires source image URL");
assert.match(higgsfield, /"dop-turbo"/, "Higgsfield video defaults to supported DoP model");
assert.doesNotMatch(higgsfield, /aspect_ratio:[\s\S]{0,120}title:[\s\S]{0,120}withPolling: false/, "Higgsfield video no longer sends unsupported text-only video payload");
assert.match(avatarProvider, /inputImageUrl: typeof request\.inputImageUrl === "string" \? request\.inputImageUrl : null/, "Higgsfield avatar provider forwards the selected static source image URL");
assert.match(avatarProvider, /safeProviderDiagnostic/, "Higgsfield avatar provider preserves sanitized internal provider diagnostics");
assert.match(avatarProvider, /providerError: diagnostic/, "sanitized Higgsfield provider diagnostics stay in internal metadata");

assert.match(storageNormalization, /MAX_STATIC_CREATIVE_PROVIDER_VIDEO_BYTES/, "video storage normalization has an explicit byte limit");
assert.match(storageNormalization, /contentTypePrefix\?: "image\/" \| "video\/"/, "provider fetcher validates video content type");
assert.match(storageNormalization, /generated-video/, "generated videos store under a dedicated generated-video path");
assert.match(storageNormalization, /video\/mp4,video\/webm,video\/quicktime/, "video normalization only accepts expected video media types");

assert.match(creativeBuilder, /asset\.asset_type === "ugc_video"/, "UGC videos are excluded from static Meta picture media");
assert.match(creativeBuilder, /asset\.asset_type === "talking_head_video"/, "talking-head videos are excluded from static Meta picture media");
assert.match(creativeBuilder, /asset\.asset_type === "montage_video"/, "montage videos are excluded from static Meta picture media");

assert.match(resolveDebt, /KNOWN_VIDEO_GENERATION_DEBT/, "known video debt resolver is exact-row scoped");
assert.match(resolveDebt, /b1d337a9-b6ae-4c90-be40-7157b6bcb02f/, "known video job id is pinned");
assert.match(resolveDebt, /76cfe4df-a488-49ff-8f3f-c616889c5c34/, "known video provider event id is pinned");
assert.match(resolveDebt, /operatorReviewedAt/, "known failed provider event is reviewed without rewriting execution status");

assert.match(creativeWizard, /customerVideoMessage/, "creative wizard sanitizes video failure messages");
assert.match(previewPage, /customerVideoMessage/, "preview page sanitizes video failure messages");
assert.doesNotMatch(videoErrors, /Review the operator diagnostics/, "operator diagnostics are not exposed in video errors");

console.log("Video generation safety tests passed.");
