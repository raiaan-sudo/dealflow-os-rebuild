import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import {
  createHiggsfieldVideo,
  getHiggsfieldProviderUsageOutcome,
  getHiggsfieldVideoStatus,
} from "../src/lib/ai/higgsfield";
import { getDurableVideoProvider } from "../src/lib/ai/video-provider";

async function main() {
let postCount = 0;
let statusCount = 0;
let rejectNext = false;
let ambiguousStatusNext: number | null = null;

const server = http.createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));

  if (request.method === "POST" && request.url === "/v1/image2video/dop") {
    postCount += 1;
    assert.equal(request.headers.authorization, "Key test-key:test-secret");
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    assert.equal(body.model, "dop-turbo");
    assert.equal(body.input_images[0].image_url, "https://assets.example.test/source.png");
    assert.equal(body.enhance_prompt, true);

    response.setHeader("content-type", "application/json");
    if (rejectNext) {
      rejectNext = false;
      response.statusCode = 422;
      response.end(JSON.stringify({ detail: "synthetic validation rejection" }));
      return;
    }
    if (ambiguousStatusNext) {
      response.statusCode = ambiguousStatusNext;
      ambiguousStatusNext = null;
      response.end(JSON.stringify({ detail: "synthetic ambiguous provider response" }));
      return;
    }
    response.end(JSON.stringify({ status: "queued", request_id: "req_test_12345678" }));
    return;
  }

  if (request.method === "GET" && request.url === "/requests/req_test_12345678/status") {
    statusCount += 1;
    assert.equal(request.headers.authorization, "Key test-key:test-secret");
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        status: "completed",
        request_id: "req_test_12345678",
        video: { url: "https://assets.example.test/render.mp4" },
      }),
    );
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: "not_found" }));
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address === "object");

Object.assign(process.env, {
  NODE_ENV: "test",
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT: "true",
  ALLOW_HIGGSFIELD_VIDEO_GENERATION: "true",
  HIGGSFIELD_CREDENTIALS: "test-key:test-secret",
  HIGGSFIELD_BASE_URL: `http://127.0.0.1:${address.port}`,
  HIGGSFIELD_VIDEO_MODEL: "dop-turbo",
});

try {
  const created = await createHiggsfieldVideo({
    prompt: "A confident realtor walks through a bright listing and gestures to the call to action.",
    inputImageUrl: "https://assets.example.test/source.png",
  });
  assert.equal(created.requestId, "req_test_12345678");
  assert.equal(created.status, "queued");
  assert.equal(postCount, 1, "a paid dispatch must never be retried implicitly");

  process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION = "false";
  const status = await getHiggsfieldVideoStatus(created.requestId);
  process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION = "true";
  assert.equal(status.status, "completed");
  assert.equal(status.videoUrl, "https://assets.example.test/render.mp4");
  assert.equal(statusCount, 1);

  await assert.rejects(
    () =>
      createHiggsfieldVideo({
        prompt: "A valid prompt that must fail before dispatch because its source URL is unsafe.",
        inputImageUrl: "http://private.example.test/source.png",
      }),
    (error: unknown) => {
      assert.equal(getHiggsfieldProviderUsageOutcome(error), "released");
      return true;
    },
  );
  assert.equal(postCount, 1, "unsafe input must fail before provider dispatch");

  for (const unsafeSourceUrl of [
    "https://127.0.0.1/source.png",
    "https://10.0.0.8/source.png",
    "https://assets.example.test:444/source.png",
    "https://assets.example.test/source.png#fragment",
    "https://attacker.invalid/source.png",
  ]) {
    await assert.rejects(
      () => createHiggsfieldVideo({
        prompt: "A valid prompt that must fail before dispatch for an untrusted source identity.",
        inputImageUrl: unsafeSourceUrl,
      }),
      (error: unknown) => {
        assert.equal(getHiggsfieldProviderUsageOutcome(error), "released");
        return true;
      },
    );
  }
  assert.equal(postCount, 1, "hostile source URLs must fail before provider dispatch");

  rejectNext = true;
  await assert.rejects(
    () =>
      createHiggsfieldVideo({
        prompt: "A second valid synthetic prompt used to prove rejected-settlement semantics.",
        inputImageUrl: "https://assets.example.test/source.png",
      }),
    (error: unknown) => {
      assert.equal(getHiggsfieldProviderUsageOutcome(error), "rejected");
      return true;
    },
  );
  assert.equal(postCount, 2, "the rejected request is one explicit dispatch");

  ambiguousStatusNext = 503;
  await assert.rejects(
    () =>
      createHiggsfieldVideo({
        prompt: "A third valid synthetic prompt used to prove ambiguous-response fencing.",
        inputImageUrl: "https://assets.example.test/source.png",
      }),
    (error: unknown) => {
      assert.equal(getHiggsfieldProviderUsageOutcome(error), "operator_action_required");
      return true;
    },
  );
  assert.equal(postCount, 3, "an ambiguous provider response must not trigger an implicit retry");

  assert.equal(getDurableVideoProvider(), "higgsfield");
  delete process.env.HIGGSFIELD_CREDENTIALS;
  process.env.HEYGEN_API_KEY = "synthetic-heygen-key";
  process.env.ALLOW_HEYGEN_VIDEO_GENERATION = "true";
  process.env.ALLOW_HEYGEN_LEGACY_FALLBACK = "false";
  assert.equal(
    getDurableVideoProvider(),
    null,
    "HeyGen must not silently replace the authoritative Higgsfield path",
  );
  process.env.ALLOW_HEYGEN_LEGACY_FALLBACK = "true";
  assert.equal(getDurableVideoProvider(), "heygen");
  process.env.HIGGSFIELD_CREDENTIALS = "test-key:test-secret";
  assert.equal(
    getDurableVideoProvider(),
    "higgsfield",
    "valid Higgsfield configuration must always win over the legacy fallback",
  );

  const registrySource = readFileSync(
    "src/lib/integrations/provider-registry.ts",
    "utf8",
  );
  assert.match(registrySource, /getDurableVideoIntegrationProvider/);
  assert.doesNotMatch(registrySource, /getAvatarVideoProvider/);

  const builderSource = readFileSync(
    "src/lib/services/creative-builder-service.ts",
    "utf8",
  );
  assert.match(builderSource, /getDurableVideoProvider/);
  assert.match(builderSource, /canonical_dispatch: "campaign_video_generation_job"/);
  assert.doesNotMatch(builderSource, /avatarProvider\.createAvatarVideo/);

  const jobSource = readFileSync("src/lib/services/video-generation-job.ts", "utf8");
  assert.match(jobSource, /video_generation_reconciliation_exhausted/);
  assert.match(jobSource, /providerAccepted: true/);
  assert.match(jobSource, /paidCreativeDispatchId/);
  assert.match(jobSource, /status: "released"/);
  assert.match(jobSource, /customerCreditsReleased: true/);
  assert.doesNotMatch(jobSource, /providerCreditsRefunded/);
  assert.match(jobSource, /finalizePaidCreativeProjection/);
  assert.match(jobSource, /video_generation_provider_identity_mismatch/);
  assert.match(jobSource, /providerName: videoProvider/);
  assert.match(jobSource, /max_attempts: 128/);
  assert.match(jobSource, /status: "unknown" as const/);
  assert.match(jobSource, /importGeneratedVideoToCanonicalStorage/);
  assert.match(jobSource, /verifyBoundHiggsfieldSourceAsset/);
  assert.match(jobSource, /inputImagePaidCreativeDispatchId/);
  assert.match(jobSource, /\.eq\("state", "projected"\)/);
  assert.match(jobSource, /storage_bucket", storedVideo\.storageBucket/);
  assert.match(jobSource, /storage_path", storedVideo\.storagePath/);
  assert.match(jobSource, /videoUrl: storedVideo\.publicUrl/);
  assert.doesNotMatch(jobSource, /provider: params\.payload\.providerName \?\? "heygen"/);

  const storageSource = readFileSync(
    "src/lib/services/generated-video-storage-service.ts",
    "utf8",
  );
  assert.match(storageSource, /\.info\(params\.storagePath\)/);
  assert.match(storageSource, /lookupDns\(url\.hostname, \{ all: true, verbatim: true \}\)/);
  assert.match(storageSource, /addresses\.some\(\(entry\) => !isPublicNetworkAddress\(entry\.address\)\)/);
  assert.match(storageSource, /lookup: createPinnedDnsLookup\(resolved\)/);
  assert.match(storageSource, /upsert: false/);
  assert.match(storageSource, /bind_generated_video_storage_v1/);
  assert.match(storageSource, /Never remove after the binding RPC was attempted/);

  const routeSource = readFileSync(
    "src/app/api/campaigns/[id]/generate-video/route.ts",
    "utf8",
  );
  assert.match(routeSource, /getDurableVideoProviderUnavailableReason/);
  assert.match(routeSource, /\.from\("creative_assets"\)/);
  assert.match(routeSource, /\.eq\("provider_name", "openai"\)/);
  assert.match(routeSource, /\.not\("paid_creative_dispatch_id", "is", null\)/);
  assert.match(routeSource, /\.eq\("operation", "openai_image_generation"\)/);
  assert.match(routeSource, /\.eq\("state", "projected"\)/);
  assert.doesNotMatch(routeSource, /inputImageUrl\s*=\s*selectedSourceImage\.imageUrl/);
  assert.match(routeSource, /providerName: videoProvider/);
  assert.match(routeSource, /provider: videoProvider/);
  assert.match(routeSource, /maxAttempts: 3/);

  const uiSource = readFileSync(
    "src/components/campaign/campaign-preview-review.tsx",
    "utf8",
  );
  assert.match(uiSource, /Generate video • \$5 credit/);
  assert.match(uiSource, /Higgsfield video/);
  assert.match(uiSource, /HeyGen legacy fallback/);

  console.log("Higgsfield guarded dispatch and durable reconciliation tests passed.");
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
