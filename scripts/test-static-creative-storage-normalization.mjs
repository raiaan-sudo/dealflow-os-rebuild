import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";
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
  extractGeneratedVideoDurationSeconds,
  fetchStaticCreativeProviderImage,
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

function mp4Box(type, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.byteLength + 8, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, payload]);
}

function fixtureMp4WithDuration(seconds) {
  const ftyp = mp4Box("ftyp", Buffer.from("isom0000isomiso2", "ascii"));
  const mvhd = Buffer.alloc(100);
  mvhd[0] = 0;
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(seconds * 1000, 16);
  return Buffer.concat([ftyp, mp4Box("moov", mp4Box("mvhd", mvhd))]);
}

assert.equal(
  extractGeneratedVideoDurationSeconds(fixtureMp4WithDuration(18), "video/mp4"),
  18,
  "MP4 duration metadata is extracted without ffprobe before launch readiness evaluation",
);

process.env.STATIC_CREATIVE_PROVIDER_IMAGE_HOSTS = "d8j0ntlcm91z4.cloudfront.net";
await validateStaticCreativeProviderImageUrlForStorage("https://d8j0ntlcm91z4.cloudfront.net/user/generated.png");
process.env.STATIC_CREATIVE_PROVIDER_IMAGE_HOSTS = "example.com,api.openai.com";

const legacyProviderVisual = {
  imageUrl: "https://example.com/legacy-provider.png",
  storageNormalized: false,
  imagePrompt: "TEXT-FREE BACKGROUND ASSET ONLY. Realistic photo.",
  visualPromptBrief: {
    visualAssetContract: "text_free_background_v2",
    visualAssetRole: "text_free_background",
  },
  qualityGate: { accepted: true },
  imageQa: { usable: true, decision: "accept", mode: "background_only", reasons: [] },
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

globalThis.fetch = async (url) => {
  assert.equal(String(url), appOwnedUrl, "app-owned creative source is fetched directly");
  return new Response(Buffer.from("not-a-real-png-but-content-type-is-guarded-by-test"), {
    status: 200,
    headers: {
      "content-type": "image/png",
    },
  });
};
const appOwnedFetch = await fetchStaticCreativeProviderImage(appOwnedUrl, {
  accept: "image/png,image/jpeg,image/webp",
  contentTypePrefix: "image/",
  errorPrefix: "Marketing Studio video source image",
});
assert.equal(appOwnedFetch.contentType, "image/png");
assert.ok(appOwnedFetch.bytes.length > 0);
globalThis.fetch = async () =>
  new Response(null, {
    status: 302,
    headers: {
      location: "https://evil.test/storage/v1/object/public/creative-assets/user-test/stolen.png",
    },
  });
await assert.rejects(
  () => fetchStaticCreativeProviderImage(appOwnedUrl, {
    accept: "image/png,image/jpeg,image/webp",
    contentTypePrefix: "image/",
    errorPrefix: "Marketing Studio video source image",
  }),
  /redirected outside creative-assets/,
  "app-owned creative source fetches cannot redirect to another host",
);
globalThis.fetch = originalFetch;

function fakeSupabase({
  uploadFails = false,
  uploadFailuresRemaining = uploadFails ? Number.POSITIVE_INFINITY : 0,
  insertFails = false,
  existingRows = [],
} = {}) {
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

            if (uploadFailuresRemaining > 0) {
              uploadFailuresRemaining -= 1;
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
        select(columns) {
          const filters = [];
          operations.push({ op: "select", columns, filters });
          const chain = {
            eq(column, value) {
              filters.push({ column, value });
              return chain;
            },
            order(column, options) {
              operations.push({ op: "order", column, options });
              return chain;
            },
            async limit(count) {
              operations.push({ op: "limit", count });
              return { data: existingRows, error: null };
            },
          };
          return chain;
        },
        update(payload) {
          operations.push({ op: "update", payload });
          const chain = {
            eq(column, value) {
              operations.push({ op: "update.eq", column, value });
              return chain;
            },
            select() {
              return {
                async single() {
                  return {
                    data: {
                      ...(existingRows[0] ?? {}),
                      ...payload,
                      id: existingRows[0]?.id ?? "updated-0",
                    },
                    error: null,
                  };
                },
              };
            },
          };
          return chain;
        },
        insert(rows) {
          const insertedRows = Array.isArray(rows) ? rows : [rows];
          operations.push({ op: "insert", rows: insertedRows });

          return {
            select() {
              return {
                async single() {
                  if (insertFails) {
                    return { data: null, error: new Error("insert failed") };
                  }

                  return {
                    data: { ...insertedRows[0], id: "new-0" },
                    error: null,
                  };
                },
                then(resolve) {
                  if (insertFails) {
                    return Promise.resolve({ data: null, error: new Error("insert failed") }).then(resolve);
                  }

                  return Promise.resolve({
                    data: insertedRows.map((row, index) => ({ ...row, id: `new-${index}` })),
                    error: null,
                  }).then(resolve);
                },
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
    imageQa: { usable: true, decision: "accept", mode: "background_only", reasons: [] },
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

const retryUploadDb = fakeSupabase({ uploadFailuresRemaining: 1 });
const retryNormalized = await normalizeStaticCreativeProviderImage({
  supabase: retryUploadDb,
  userId: "user-test",
  campaignId: "campaign-test",
  creativeId: "campaign-test-creative-retry",
  generationBatchId: "batch-retry",
  providerUrl: providerDataUri,
});
assert.match(retryNormalized.durableUrl, /\/storage\/v1\/object\/public\/creative-assets\//);
assert.equal(
  retryUploadDb.operations.filter((item) => item.op === "upload").length,
  2,
  "storage normalization retries a transient upload failure once",
);
assert.equal(
  retryUploadDb.operations.filter((item) => item.op === "upload")[1].upsert,
  true,
  "retry upload uses upsert to recover from partial transient writes",
);

const localOutputDir = await mkdtemp(path.join(os.tmpdir(), "dealflow-static-creative-"));
const previousWorkerOutputDir = process.env.MARKETING_STUDIO_WORKER_OUTPUT_DIR;
process.env.MARKETING_STUDIO_WORKER_OUTPUT_DIR = localOutputDir;
const localPngPath = path.join(localOutputDir, "higgsfield-output.png");
await writeFile(localPngPath, Buffer.from(providerDataUri.split(",")[1], "base64"));
try {
  const localDb = fakeSupabase();
  const localNormalized = await normalizeStaticCreativeProviderImage({
    supabase: localDb,
    userId: "user-test",
    campaignId: "campaign-test",
    creativeId: "campaign-test-creative-local",
    generationBatchId: "batch-local",
    providerUrl: localPngPath,
  });
  assert.match(localNormalized.durableUrl, /\/storage\/v1\/object\/public\/creative-assets\//);
  assert.match(localNormalized.storagePath, /^user-test\/campaign-test\/generated-static\/campaign-test-creative-local\/batch-local\.png$/);
  assert.equal(localNormalized.contentType, "image/png");
  assert.equal(localDb.operations.some((item) => item.op === "upload"), true);

  await assert.rejects(
    () => normalizeStaticCreativeProviderImage({
      supabase: fakeSupabase(),
      userId: "user-test",
      campaignId: "campaign-test",
      creativeId: "campaign-test-creative-local-blocked",
      generationBatchId: "batch-local",
      providerUrl: path.join(repoRoot, "package.json"),
    }),
    /outside the approved worker output directories|supported image type/,
    "arbitrary local files are not accepted as generated images",
  );
} finally {
  if (previousWorkerOutputDir === undefined) {
    delete process.env.MARKETING_STUDIO_WORKER_OUTPUT_DIR;
  } else {
    process.env.MARKETING_STUDIO_WORKER_OUTPUT_DIR = previousWorkerOutputDir;
  }
  await rm(localOutputDir, { recursive: true, force: true });
}

const successfulDb = fakeSupabase();
await persistStaticCreativeAssets({
  supabase: successfulDb,
  userId: "user-test",
  campaignId: "campaign-test",
  staticAds: [buildAsset()],
});
const successfulInsert = successfulDb.operations.find((item) => item.op === "insert");
assert.ok(successfulInsert, "creative asset rows are inserted");
const imageFrame = successfulDb.operations
  .filter((item) => item.op === "insert")
  .flatMap((item) => item.rows)
  .find((row) => row.metadata?.role === "app_composed_final_static");
assert.ok(imageFrame, "app-composed final static row is inserted");
assert.equal(imageFrame.status, "requires_review", "app-composed finals remain review-only and are not launch-ready Higgsfield rasters");
assert.match(imageFrame.file_url, /\/storage\/v1\/object\/public\/creative-assets\//);
assert.notEqual(imageFrame.file_url, providerDataUri, "provider URL is not the primary durable URL");
assert.equal(imageFrame.thumbnail_url, imageFrame.file_url);
assert.equal(imageFrame.metadata.provider_original_url, providerDataUri);
assert.equal(imageFrame.metadata.storageBucket, "creative-assets");
assert.equal(imageFrame.metadata.storageNormalized, true);
assert.equal(imageFrame.metadata.appComposedFinal, true);
assert.equal(imageFrame.metadata.imageQa.mode, "app_composed_final");
assert.equal(imageFrame.metadata.imageQa.decision, "accept");
assert.match(
  imageFrame.metadata.storagePath,
  /^user-test\/campaign-test\/app-composed-static\/campaign-test-creative-0\/[a-f0-9]{24}\.png$/,
  "app-composed final storage path is deterministic by composition hash",
);
assert.equal(successfulDb.operations.some((item) => item.op === "delete"), false, "all-ready replacement preserves historical evidence rows");

const existingRows = successfulInsert.rows.map((row, index) => ({
  ...row,
  id: `existing-${index}`,
  created_at: "2026-05-21T00:00:00.000Z",
  updated_at: "2026-05-21T00:00:00.000Z",
}));
const idempotentDb = fakeSupabase({ existingRows });
const idempotentRows = await persistStaticCreativeAssets({
  supabase: idempotentDb,
  userId: "user-test",
  campaignId: "campaign-test",
  staticAds: [buildAsset()],
});
assert.equal(
  idempotentDb.operations.some((item) => item.op === "insert"),
  false,
  "same app-composed composition reuses existing current rows instead of inserting duplicates",
);
assert.equal(idempotentRows.length, 2);
assert.equal(idempotentRows.every((row) => String(row.id).startsWith("existing-")), true);
assert.deepEqual(
  idempotentDb.operations
    .filter((item) => item.op === "upload")
    .map((item) => item.storagePath),
  [imageFrame.metadata.storagePath],
  "retrying the same composition upserts the same durable storage object path",
);

const finishedAdDb = fakeSupabase();
await persistStaticCreativeAssets({
  supabase: finishedAdDb,
  userId: "user-test",
  campaignId: "campaign-test",
  staticAds: [
    {
      ...buildAsset(),
      imageGenerationProvider: "higgsfield_marketing_studio",
      qualityTier: "higgsfield_finished_ad",
      storageNormalized: false,
      imagePrompt: "MARKETING STUDIO FINISHED AD CREATIVE. Required CTA text: Check My Options.",
      imagePromptConfig: {
        prompt: "MARKETING STUDIO FINISHED AD CREATIVE. Required CTA text: Check My Options.",
        negativePrompt: "charts; tables; dashboard",
        aspectRatio: "1:1",
      },
      visualPromptBrief: null,
      imageQa: {
        mode: "finished_ad",
        usable: true,
        decision: "accept",
        reasons: [],
        textDensity: 0.42,
        layoutRisk: 0.2,
        detectedTextSamples: ["Check My Options"],
      },
      qualityGate: {
        accepted: false,
        score: 6,
        hardFailures: ["Legacy composed-background quality gate does not apply to accepted finished_ad rasters."],
      },
    },
  ],
});
const finishedAdInsert = finishedAdDb.operations.find((item) => item.op === "insert");
assert.ok(
  finishedAdDb.operations.some((item) => item.op === "upload"),
  "accepted finished_ad provider rasters are normalized before final launch readiness",
);
assert.equal(finishedAdInsert.rows[0].status, "ready");
assert.match(finishedAdInsert.rows[0].file_url, /\/storage\/v1\/object\/public\/creative-assets\//);
assert.match(finishedAdInsert.rows[0].metadata.storagePath, /^user-test\/campaign-test\/generated-static\//);
assert.equal(finishedAdInsert.rows[0].metadata.imageQa.decision, "accept");
assert.equal(finishedAdInsert.rows[0].metadata.imageQa.mode, "finished_ad");
assert.equal(finishedAdInsert.rows[0].metadata.storageNormalized, true);

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
assert.equal(failedInsert.rows[0].metadata.imageQa.usable, false);
assert.equal(failedInsert.rows[0].metadata.imageQa.decision, "reject");
assert.ok(failedInsert.rows[0].metadata.imageQa.reasons.includes("image_fetch_failed"));
assert.equal(
  uploadFailDb.operations.some((item) => item.op === "delete"),
  false,
  "failed normalization does not delete existing accepted assets",
);

const appOwnedDb = fakeSupabase();
globalThis.fetch = async (url) => {
  assert.equal(String(url), appOwnedUrl, "old app-owned creative source is fetched for recomposition");
  return new Response(Buffer.from(providerDataUri.split(",")[1], "base64"), {
    status: 200,
    headers: {
      "content-type": "image/png",
    },
  });
};
await persistStaticCreativeAssets({
  supabase: appOwnedDb,
  userId: "user-test",
  campaignId: "campaign-test",
  staticAds: [buildAsset(appOwnedUrl)],
});
globalThis.fetch = originalFetch;
const appOwnedInsert = appOwnedDb.operations.find((item) => item.op === "insert");
assert.equal(appOwnedDb.operations.some((item) => item.op === "upload"), true, "old app-owned assets are recomposed into current launch-ready finals");
assert.notEqual(appOwnedInsert.rows[0].file_url, appOwnedUrl);
assert.equal(appOwnedInsert.rows[0].metadata.appComposedFinal, true);

console.log("Static creative storage normalization tests passed.");
