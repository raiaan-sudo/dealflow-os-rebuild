import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.example.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "anon-test";
process.env.STATIC_CREATIVE_PROVIDER_IMAGE_HOSTS = "example.com,api.openai.com";

Module._load = function load(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(
      this,
      path.join(repoRoot, "src", request.slice(2)),
      parent,
      isMain,
      options,
    );
  }

  return originalResolve.call(this, request, parent, isMain, options);
};

Module._extensions[".ts"] = function loadTs(module, filename) {
  const source = ts.sys.readFile(filename);
  const output = ts.transpileModule(source ?? "", {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const require = createRequire(import.meta.url);
const {
  isAppOwnedCreativeAssetUrl,
  normalizeStaticCreativeProviderImage,
  validateStaticCreativeProviderImageUrlForStorage,
} = require("../src/lib/services/static-creative-storage-normalization.ts");
const {
  persistStaticCreativeAssets,
} = require("../src/lib/services/static-creative-asset-service.ts");
const {
  evaluateStaticVisualAssetDecision,
} = require("../src/lib/services/static-creative-visual-qa.ts");
const {
  buildComposedStaticAdPreview,
} = require("../src/lib/services/static-ad-template-renderer.ts");

const providerDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const appOwnedUrl = "https://supabase.example.test/storage/v1/object/public/creative-assets/user-test/campaign-test/generated-static/static-1/existing.png";

assert.equal(isAppOwnedCreativeAssetUrl(appOwnedUrl), true);
assert.equal(isAppOwnedCreativeAssetUrl("https://provider.test/generated.png"), false);
assert.equal(
  isAppOwnedCreativeAssetUrl("https://evil.test/storage/v1/object/public/creative-assets/user-test/generated.png"),
  false,
  "evil host cannot spoof app-owned storage by path substring",
);
await assert.rejects(
  () => validateStaticCreativeProviderImageUrlForStorage("http://example.com/generated.png"),
  /must use HTTPS/,
);
await assert.rejects(
  () => validateStaticCreativeProviderImageUrlForStorage("https://127.0.0.1/generated.png"),
  /host is not approved|blocked network/,
);
await validateStaticCreativeProviderImageUrlForStorage("https://example.com/generated.png");

const legacyProviderVisual = {
  imageUrl: "https://example.com/legacy-provider.png",
  storageNormalized: false,
  imagePrompt: "TEXT-FREE BACKGROUND ASSET ONLY. Realistic photo.",
  visualPromptBrief: {
    visualAssetContract: "text_free_background_v2",
    visualAssetRole: "text_free_background",
  },
  qualityGate: { accepted: true },
  imageQa: { usable: true, decision: "accept", reasons: [] },
};
assert.equal(
  evaluateStaticVisualAssetDecision(legacyProviderVisual).usable,
  false,
  "legacy provider URLs are readable for audit but not launch-ready until normalized into app-owned storage",
);
const legacyPreview = buildComposedStaticAdPreview({
  ...legacyProviderVisual,
  headline: "See Homes That Match",
  primaryText: "Get a focused buyer shortlist.",
  cta: "See Homes That Match",
  category: "buyer",
  location: "Toronto, ON",
});
assert.equal(legacyPreview.status, "background_rejected");
assert.equal(legacyPreview.backgroundImageUrl, null, "legacy provider raster is not rendered as primary creative");

const originalFetch = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(null, {
    status: 302,
    headers: {
      location: "https://127.0.0.1/private.png",
    },
  });
await assert.rejects(
  () => normalizeStaticCreativeProviderImage({
    supabase: fakeSupabase(),
    userId: "user-test",
    campaignId: "campaign-test",
    creativeId: "campaign-test-creative-redirect",
    generationBatchId: "batch-test",
    providerUrl: "https://example.com/redirect.png",
  }),
  /host is not approved|blocked network/,
  "redirect-to-private URLs are blocked before storage",
);
globalThis.fetch = originalFetch;

function fakeSupabase({ uploadFails = false, insertFails = false } = {}) {
  const operations = [];

  return {
    operations,
    storage: {
      from(bucket) {
        operations.push({ op: "storage.from", bucket });

        return {
          async upload(storagePath, body, options) {
            operations.push({
              op: "upload",
              bucket,
              storagePath,
              byteSize: body.byteLength,
              contentType: options.contentType,
              upsert: options.upsert,
            });

            if (uploadFails) {
              return { error: new Error("upload failed") };
            }

            return { error: null };
          },
          getPublicUrl(storagePath) {
            operations.push({ op: "getPublicUrl", bucket, storagePath });

            return {
              data: {
                publicUrl: `https://example.test/storage/v1/object/public/${bucket}/${storagePath}`,
              },
            };
          },
        };
      },
    },
    from() {
      return {
        insert(rows) {
          operations.push({ op: "insert", rows });

          return {
            async select() {
              if (insertFails) {
                return { data: null, error: new Error("insert failed") };
              }

              return {
                data: rows.map((row, index) => ({ ...row, id: `new-${index}` })),
                error: null,
              };
            },
          };
        },
        delete() {
          operations.push({ op: "delete" });
          const chain = {
            eq() { return chain; },
            in() { return chain; },
            like() { return chain; },
            async not() { return { data: null, error: null }; },
          };

          return chain;
        },
      };
    },
  };
}

function buildAsset(imageUrl = providerDataUri) {
  return {
    id: "static-1",
    angle: "opportunity",
    imageUrl,
    imageGenerationState: "generated",
    imageGenerationMessage: null,
    imageGenerationModel: "marketing_studio_image",
    imageGenerationProvider: "higgsfield",
    visualConcept: "Toronto buyer background",
    imagePrompt: "TEXT-FREE BACKGROUND ASSET ONLY. Realistic photo.",
    imagePromptConfig: {
      prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Realistic photo.",
      negativePrompt: "final ad layout; flyer; text",
      aspectRatio: "1:1",
    },
    preferredImageModel: "gpt-image-1.5",
    visualPromptBrief: {
      category: "buyer",
      visualAssetContract: "text_free_background_v2",
      visualAssetRole: "text_free_background",
      mediaBuyerReferencePattern: "buyer source photo",
      triggerCondition: "market uncertainty",
      internalTension: "approval uncertainty",
      mechanism: "buyer shortlist",
      proofStyle: "budget fit",
      visualLogic: [],
      overlayLogic: [],
      forbiddenPatterns: [],
      preferredModel: "gpt-image-1.5",
      visualConcept: "Toronto buyer background",
      promptConfig: {
        prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Realistic photo.",
        negativePrompt: "text",
        aspectRatio: "1:1",
      },
    },
    imageQa: { usable: true, decision: "accept", reasons: [] },
    scoreBreakdown: null,
    hook: "See matched homes",
    overlayText: "See matched homes",
    primaryText: "Get a focused buyer shortlist.",
    headline: "See Homes That Match",
    cta: "See Homes That Match",
    score: 8,
    recommended: true,
    qualityGate: { accepted: true, score: 8, hardFailures: [] },
    offerQuality: null,
  };
}

const storageDb = fakeSupabase();
const normalized = await normalizeStaticCreativeProviderImage({
  supabase: storageDb,
  userId: "user-test",
  campaignId: "campaign-test",
  creativeId: "campaign-test-creative-0",
  generationBatchId: "batch-test",
  providerUrl: providerDataUri,
});
assert.match(normalized.durableUrl, /\/storage\/v1\/object\/public\/creative-assets\//);
assert.equal(normalized.storageBucket, "creative-assets");
assert.match(normalized.storagePath, /^user-test\/campaign-test\/generated-static\/campaign-test-creative-0\/batch-test\.png$/);
assert.equal(normalized.contentType, "image/png");
assert.ok(normalized.byteSize > 0);
assert.equal(storageDb.operations.some((item) => item.op === "upload"), true);

const successfulDb = fakeSupabase();
await persistStaticCreativeAssets({
  supabase: successfulDb,
  userId: "user-test",
  campaignId: "campaign-test",
  staticAds: [buildAsset()],
});
const successfulInsert = successfulDb.operations.find((item) => item.op === "insert");
assert.ok(successfulInsert, "creative asset rows are inserted");
const [imageFrame] = successfulInsert.rows;
assert.equal(imageFrame.status, "ready");
assert.match(imageFrame.file_url, /\/storage\/v1\/object\/public\/creative-assets\//);
assert.notEqual(imageFrame.file_url, providerDataUri, "provider URL is not the primary durable URL");
assert.equal(imageFrame.thumbnail_url, imageFrame.file_url);
assert.equal(imageFrame.metadata.provider_original_url, providerDataUri);
assert.equal(imageFrame.metadata.storageBucket, "creative-assets");
assert.equal(imageFrame.metadata.storageNormalized, true);
assert.equal(successfulDb.operations.some((item) => item.op === "delete"), true, "all-ready replacement can clean old rows");

const uploadFailDb = fakeSupabase({ uploadFails: true });
await persistStaticCreativeAssets({
  supabase: uploadFailDb,
  userId: "user-test",
  campaignId: "campaign-test",
  staticAds: [buildAsset()],
});
const failedInsert = uploadFailDb.operations.find((item) => item.op === "insert");
assert.ok(failedInsert, "failed normalization is persisted as non-ready diagnostic rows");
assert.equal(failedInsert.rows[0].status, "failed");
assert.equal(failedInsert.rows[0].file_url, null);
assert.equal(failedInsert.rows[0].thumbnail_url, null);
assert.equal(failedInsert.rows[0].metadata.provider_original_url, providerDataUri);
assert.equal(failedInsert.rows[0].metadata.storageNormalized, false);
assert.equal(
  uploadFailDb.operations.some((item) => item.op === "delete"),
  false,
  "failed normalization does not delete existing accepted assets",
);

const appOwnedDb = fakeSupabase();
await persistStaticCreativeAssets({
  supabase: appOwnedDb,
  userId: "user-test",
  campaignId: "campaign-test",
  staticAds: [buildAsset(appOwnedUrl)],
});
const appOwnedInsert = appOwnedDb.operations.find((item) => item.op === "insert");
assert.equal(appOwnedDb.operations.some((item) => item.op === "upload"), false, "old app-owned assets remain readable without reupload");
assert.equal(appOwnedInsert.rows[0].file_url, appOwnedUrl);
assert.equal(appOwnedInsert.rows[0].metadata.storageNormalizationReusedExistingAppAsset, true);

console.log("Static creative storage normalization tests passed.");
