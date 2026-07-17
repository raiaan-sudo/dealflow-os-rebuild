import assert from "node:assert/strict";
import { persistStaticCreativeAssets } from "../src/lib/services/static-creative-asset-service";
import type { StaticCreativeAsset } from "../src/lib/services/creative-engine";
import { importGeneratedStaticToCanonicalStorage } from "../src/lib/services/generated-static-storage-service";
import fs from "node:fs";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000002";
const campaignId = "30000000-0000-4000-8000-000000000003";
const dispatchId = "40000000-0000-4000-8000-000000000004";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const mutableEnv = process.env as Record<string, string | undefined>;

function staticAsset(sourceUrl: string): StaticCreativeAsset {
  return {
    id: "static-1",
    angle: "opportunity",
    imageUrl: sourceUrl,
    imageGenerationState: "generated",
    imageGenerationMessage: null,
    imageGenerationModel: "gpt-image-1.5",
    providerDispatchId: dispatchId,
    visualConcept: "verified image",
    imagePrompt: "safe prompt",
    imagePromptConfig: null,
    preferredImageModel: "gpt-image-1.5",
    visualPromptBrief: null,
    scoreBreakdown: null,
    hook: "Hook",
    overlayText: "Overlay",
    primaryText: "Primary",
    headline: "Headline",
    cta: "Learn More",
    score: 9,
    recommended: true,
    offerQuality: null,
    qualityGate: null,
  };
}

function harness() {
  const objects = new Map<string, {
    bytes: Uint8Array;
    metadata: Record<string, unknown>;
    contentType: string;
  }>();
  const persistedRows: Array<Record<string, unknown>> = [];
  const projectionReceipts: Array<Record<string, unknown>> = [];
  const rpcOrder: string[] = [];
  let databaseWrites = 0;
  let uploads = 0;

  const bucket = {
    async list(folder: string, options: { search: string }) {
      const prefix = `${folder}/`;
      return {
        data: [...objects.keys()]
          .filter((path) => path.startsWith(prefix))
          .filter((path) => path.slice(prefix.length) === options.search)
          .map((path) => ({ name: path.slice(prefix.length) })),
        error: null,
      };
    },
    async info(path: string) {
      const object = objects.get(path);
      return object
        ? { data: { metadata: object.metadata }, error: null }
        : { data: null, error: { message: "not found" } };
    },
    async upload(
      path: string,
      bytes: Uint8Array,
      options: { contentType: string; metadata: Record<string, unknown> },
    ) {
      uploads += 1;
      objects.set(path, {
        bytes: new Uint8Array(bytes),
        metadata: options.metadata,
        contentType: options.contentType,
      });
      return { data: { path }, error: null };
    },
    getPublicUrl(path: string) {
      return { data: { publicUrl: `https://dealflow.invalid/creative-assets/${path}` } };
    },
  };

  const client = {
    storage: { from: () => bucket },
    from(table: string) {
      assert.equal(table, "creative_assets");
      return {
        delete() {
          const chain: Record<string, unknown> = {};
          for (const method of ["eq", "in", "is"]) {
            chain[method] = () => chain;
          }
          chain.like = async () => {
            databaseWrites += 1;
            return { error: null };
          };
          return chain;
        },
        upsert(rows: Array<Record<string, unknown>>) {
          return {
            async select() {
              databaseWrites += 1;
              persistedRows.push(...rows.map((row, index) => ({
                ...row,
                id: row.id ?? `50000000-0000-4000-8000-00000000000${index}`,
              })));
              return { data: persistedRows, error: null };
            },
          };
        },
      };
    },
    async rpc(name: string, input: Record<string, unknown>) {
      rpcOrder.push(name);
      if (name === "authorize_generated_static_storage_upload_v1") {
        assert.match(String(input.p_storage_path), /^generated-static\//);
        assert.match(String(input.p_content_sha256), /^[0-9a-f]{64}$/);
        return { data: [{ authorized: true, reused: false, permit_state: "authorized" }], error: null };
      }
      if (name === "bind_generated_static_storage_v1") {
        assert.match(String(input.p_storage_path), /^generated-static\//);
        assert.notEqual(input.p_image_asset_id, input.p_thumbnail_asset_id);
        return { data: [{ bound: true, reused: false }], error: null };
      }
      assert.equal(name, "finalize_paid_creative_projection_v1");
      projectionReceipts.push(input);
      return { data: [{ dispatch_state: "projected", usage_status: "consumed" }], error: null };
    },
  };

  return {
    client: client as any,
    objects,
    persistedRows,
    projectionReceipts,
    rpcOrder,
    snapshot: () => ({ databaseWrites, uploads }),
  };
}

async function main() {
  const manualUploadSource = fs.readFileSync(
    "src/lib/services/creative-builder-service.ts",
    "utf8",
  );
  assert.ok(
    manualUploadSource.indexOf("await validateManualCreativeAssetFile") <
      manualUploadSource.indexOf(".upload(storagePath, verifiedContent.bytes"),
    "manual upload persisted content before signature validation",
  );

  const validHarness = harness();
  const generatedAsset = staticAsset(`data:image/png;base64,${png.toString("base64")}`);
  const result = await persistStaticCreativeAssets({
    supabase: validHarness.client,
    organizationId,
    userId,
    campaignId,
    staticAds: [generatedAsset],
  });
  assert.equal(result.length, 2);
  assert.deepEqual(validHarness.snapshot(), { databaseWrites: 2, uploads: 1 });
  assert.equal(validHarness.projectionReceipts.length, 1);
  assert.deepEqual(validHarness.rpcOrder, [
    "authorize_generated_static_storage_upload_v1",
    "bind_generated_static_storage_v1",
    "finalize_paid_creative_projection_v1",
  ]);
  assert.equal(validHarness.objects.size, 1);
  assert.match(
    generatedAsset.imageUrl,
    /^https:\/\/dealflow\.invalid\/creative-assets\/generated-static\//,
    "campaign-plan input retained the provider URL",
  );
  for (const row of validHarness.persistedRows) {
    assert.match(String(row.file_url), /^https:\/\/dealflow\.invalid\/creative-assets\/generated-static\//);
    assert.doesNotMatch(String(row.file_url), /^data:|^https:\/\/[^/]*openai/i);
    assert.equal(row.storage_bucket, "creative-assets");
    assert.match(String(row.storage_path), /^generated-static\//);
    const metadata = row.metadata as Record<string, unknown>;
    const canonical = metadata.canonicalStorage as Record<string, unknown>;
    assert.equal(canonical.provenance, "dealflow_canonical_storage");
    assert.match(String(canonical.contentSha256), /^[0-9a-f]{64}$/);
  }
  const receipt = validHarness.projectionReceipts[0]!.p_projection_receipt as Record<string, unknown>;
  assert.match(String(receipt.contentSha256), /^[0-9a-f]{64}$/);
  assert.match(String(receipt.storagePath), /^generated-static\//);

  const previousNodeEnv = process.env.NODE_ENV;
  const previousLoopback = process.env.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT;
  mutableEnv.NODE_ENV = "test";
  mutableEnv.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT = "true";
  try {
    const remoteHarness = harness();
    const remote = await importGeneratedStaticToCanonicalStorage({
      client: remoteHarness.client,
      organizationId,
      userId,
      campaignId,
      providerName: "openai",
      dispatchId: "60000000-0000-4000-8000-000000000006",
      sourceUrl: "http://127.0.0.1:43123/provider-image",
      fetchImpl: async () => new Response(png, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(png.length) },
      }),
    });
    assert.match(remote.publicUrl, /generated-static/);
    assert.equal(remoteHarness.snapshot().uploads, 1, "provider URL was not copied to canonical storage");

    const mismatchHarness = harness();
    await assert.rejects(
      importGeneratedStaticToCanonicalStorage({
        client: mismatchHarness.client,
        organizationId,
        userId,
        campaignId,
        providerName: "openai",
        dispatchId: "70000000-0000-4000-8000-000000000007",
        sourceUrl: "http://127.0.0.1:43123/provider-image",
        fetchImpl: async () => new Response(png, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      }),
      /MIME type does not match/,
    );
    assert.equal(mismatchHarness.snapshot().uploads, 0);
  } finally {
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
    if (previousLoopback === undefined) delete mutableEnv.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT;
    else mutableEnv.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT = previousLoopback;
  }

  for (const sourceUrl of [
    `data:image/jpeg;base64,${png.toString("base64")}`,
    `data:image/png;base64,${png.subarray(0, 24).toString("base64")}`,
    "data:image/png;base64,bm90LW1lZGlh",
  ]) {
    const invalidHarness = harness();
    await assert.rejects(
      persistStaticCreativeAssets({
        supabase: invalidHarness.client,
        organizationId,
        userId,
        campaignId,
        staticAds: [staticAsset(sourceUrl)],
      }),
      /MIME type does not match|truncated|signature/i,
    );
    assert.deepEqual(
      invalidHarness.snapshot(),
      { databaseWrites: 0, uploads: 0 },
      "invalid static content reached persistence",
    );
    assert.equal(
      invalidHarness.projectionReceipts.length,
      0,
      "invalid static content settled customer credits",
    );
  }

  console.log("static creative canonical integrity: PASS (byte validation, canonical storage, digest provenance, no persistence/settlement on failure)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
