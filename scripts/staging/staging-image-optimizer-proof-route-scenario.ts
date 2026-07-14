import assert from "node:assert/strict";

const scenario = process.argv[2];
const projectId = process.env.DEALFLOW_TEST_CANONICAL_STAGING_PROJECT_ID ?? "";
assert.match(projectId, /^prj_[A-Za-z0-9]+$/);

Object.assign(process.env, {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  VERCEL_PROJECT_ID: projectId,
  DEALFLOW_STAGING_VERCEL_PROJECT_ID: projectId,
  DEALFLOW_STAGING_HOST_ATTESTATION:
    "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
});

if (scenario === "production") {
  process.env.DEALFLOW_DEPLOYMENT_TARGET = "production";
} else if (scenario === "forged-project") {
  process.env.VERCEL_PROJECT_ID = `${projectId}-forged`;
} else if (scenario === "forged-attestation") {
  process.env.DEALFLOW_STAGING_HOST_ATTESTATION = "forged";
} else if (scenario !== "exact-staging") {
  throw new Error(`Unknown staging optimizer proof route scenario: ${scenario}`);
}

async function main() {
  const { GET } = await import(
    "../../src/app/staging-image-optimizer-proof.png/route"
  );
  const response = GET();
  const body = Buffer.from(await response.arrayBuffer());

  if (scenario === "exact-staging") {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.ok(body.length > 0);
  } else {
    assert.equal(response.status, 404);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    assert.equal(body.toString("utf8"), "Not found.");
  }

  process.stdout.write(`staging optimizer proof route ${scenario}: PASS\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
