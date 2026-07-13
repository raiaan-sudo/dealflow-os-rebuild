import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import {
  createHiggsfieldVideo,
  getHiggsfieldProviderUsageOutcome,
  getHiggsfieldVideoStatus,
} from "../src/lib/ai/higgsfield";

async function main() {
let postCount = 0;
let statusCount = 0;
let rejectNext = false;

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

  const status = await getHiggsfieldVideoStatus(created.requestId);
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
