#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const file = "src/lib/deployment-target.ts";
const source = fs.readFileSync(file, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { module: { exports: {} }, exports: {}, process: { env: {} } };
context.exports = context.module.exports;
vm.runInNewContext(transpiled, context, { filename: file });
const deployment = context.module.exports;
const canonicalStagingProjectId = String(
  JSON.parse(fs.readFileSync(".vercel/project.json", "utf8")).projectId,
);

const canonicalStaging = {
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  VERCEL_PROJECT_ID: canonicalStagingProjectId,
  DEALFLOW_STAGING_VERCEL_PROJECT_ID: canonicalStagingProjectId,
  DEALFLOW_STAGING_HOST_ATTESTATION:
    deployment.DEALFLOW_STAGING_HOST_ATTESTATION_VALUE,
};
assert.equal(deployment.isExactIsolatedStagingVercelHost(canonicalStaging), true);
assert.equal(deployment.getDeploymentTarget(canonicalStaging), "staging");
assert.equal(deployment.isExactIsolatedStagingVercelHost({
  ...canonicalStaging,
  VERCEL_PROJECT_ID: "self-matching-wrong-project",
  DEALFLOW_STAGING_VERCEL_PROJECT_ID: "self-matching-wrong-project",
}), false);
assert.equal(deployment.isExactIsolatedStagingVercelHost({
  ...canonicalStaging,
  DEALFLOW_STAGING_VERCEL_PROJECT_ID: "stale-expected-project",
}), false);
assert.equal(deployment.isExactIsolatedStagingVercelHost({
  ...canonicalStaging,
  VERCEL_ENV: "preview",
}), false);

const selfAssertedProduction = {
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  VERCEL_PROJECT_ID: "self-asserted-production-project",
  DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID: "self-asserted-production-project",
  DEALFLOW_PRODUCTION_HOST_ATTESTATION:
    deployment.DEALFLOW_PRODUCTION_HOST_ATTESTATION_VALUE,
};
assert.equal(deployment.isExactProductionVercelHost(selfAssertedProduction), false);
assert.equal(deployment.getDeploymentTarget(selfAssertedProduction), "unknown");
assert.equal(
  deployment.getDeploymentTarget({ DEALFLOW_DEPLOYMENT_TARGET: "production" }),
  "unknown",
);
assert.equal(
  deployment.getDeploymentTarget({
    VERCEL_ENV: "preview",
    DEALFLOW_DEPLOYMENT_TARGET: "production",
  }),
  "preview",
);
assert.equal(
  deployment.getDeploymentTarget({
    VERCEL_ENV: "development",
    DEALFLOW_DEPLOYMENT_TARGET: "production",
  }),
  "development",
);

console.log(
  "deployment target authority: PASS (canonical staging only; wrong/stale/preview staging rejected; production env self-attestation and local production rejected; generic previews preserved)",
);
