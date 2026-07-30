#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const file = "src/lib/deployment-target.ts";
const attestationFile = "src/lib/durable-worker-runtime-attestation.ts";
const attestationSource = fs.readFileSync(attestationFile, "utf8");
const attestationTranspiled = ts.transpileModule(attestationSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const attestationContext = {
  module: { exports: {} },
  exports: {},
  process: { env: {} },
};
attestationContext.exports = attestationContext.module.exports;
vm.runInNewContext(attestationTranspiled, attestationContext, {
  filename: attestationFile,
});
const source = fs.readFileSync(file, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = {
  module: { exports: {} },
  exports: {},
  process: { env: {} },
  require(specifier) {
    if (specifier === "@/lib/durable-worker-runtime-attestation") {
      return attestationContext.module.exports;
    }
    throw new Error(`Unexpected test import: ${specifier}`);
  },
};
context.exports = context.module.exports;
vm.runInNewContext(transpiled, context, { filename: file });
const deployment = context.module.exports;
const canonicalStagingProjectId = String(
  JSON.parse(fs.readFileSync(".vercel/project.json", "utf8")).projectId,
);
const canonicalProductionProjectId =
  "prj_3FUgh87aRdp4sNDrYzOEsXDyQERm";

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
  VERCEL: "1",
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  VERCEL_PROJECT_ID: "self-asserted-production-project",
  DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID: "self-asserted-production-project",
  DEALFLOW_PRODUCTION_HOST_ATTESTATION:
    deployment.DEALFLOW_PRODUCTION_HOST_ATTESTATION_VALUE,
};
assert.equal(deployment.isExactProductionVercelHost(selfAssertedProduction), false);
assert.equal(deployment.getDeploymentTarget(selfAssertedProduction), "unknown");
const canonicalProduction = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  VERCEL_PROJECT_ID: canonicalProductionProjectId,
  DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID: canonicalProductionProjectId,
  DEALFLOW_PRODUCTION_HOST_ATTESTATION:
    deployment.DEALFLOW_PRODUCTION_HOST_ATTESTATION_VALUE,
};
assert.equal(deployment.isExactProductionVercelHost(canonicalProduction), true);
assert.equal(deployment.getDeploymentTarget(canonicalProduction), "production");
assert.equal(deployment.isExactProductionVercelHost({
  ...canonicalProduction,
  VERCEL: undefined,
}), false);
assert.equal(deployment.isExactProductionVercelHost({
  ...canonicalProduction,
  VERCEL_ENV: "preview",
}), false);
assert.equal(deployment.isExactProductionVercelHost({
  ...canonicalProduction,
  DEALFLOW_PRODUCTION_VERCEL_PROJECT_ID: "stale-expected-project",
}), false);
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
  "deployment target authority: PASS (canonical production and staging accepted only on their pinned Vercel projects; forged, wrong, stale, preview, and local production claims rejected; generic previews preserved)",
);
