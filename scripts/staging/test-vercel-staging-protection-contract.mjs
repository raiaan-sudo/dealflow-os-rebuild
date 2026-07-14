#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  StagingHostRedirectError,
  classifyStagingHostReadiness,
  configureExactStagingVercelProtection,
  verifyExactStagingVercelProtection,
} from "./vercel-staging-protection-contract.mjs";

const projectId = "prj_isolated_staging_fixture";
const organizationId = "team_isolated_staging_fixture";
const projectName = "dealflow-os-rebuild-selfserve-clean";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const authority = Object.freeze({
  projectId,
  expectedProjectName: projectName,
  expectedProjectIdFingerprint: sha256(projectId),
  expectedOrganizationIdFingerprint: sha256(organizationId),
});
const project = (mode = "all_except_custom_domains", overrides = {}) => ({
  id: projectId,
  name: projectName,
  accountId: organizationId,
  ssoProtection: { deploymentType: mode },
  ...overrides,
});

{
  const calls = [];
  const result = await configureExactStagingVercelProtection({
    ...authority,
    request(call) {
      calls.push(call);
      return project();
    },
  });
  assert.equal(result.changed, false);
  assert.equal(result.requiredMode, "all_except_custom_domains");
  assert.equal(result.uniqueDeploymentsRemainProtected, true);
  assert.equal(result.productionAliasesRequireApplicationGate, true);
  assert.deepEqual(calls, [
    { method: "GET", path: `/v9/projects/${projectId}`, body: null },
    { method: "GET", path: `/v9/projects/${projectId}`, body: null },
  ]);
}

{
  const calls = [];
  let configured = false;
  const result = await configureExactStagingVercelProtection({
    ...authority,
    request(call) {
      calls.push(call);
      if (call.method === "PATCH") {
        assert.equal(call.path, `/v9/projects/${projectId}`);
        assert.deepEqual(call.body, {
          ssoProtection: { deploymentType: "all_except_custom_domains" },
        });
        configured = true;
        return project("all_except_custom_domains");
      }
      return project(configured ? "all_except_custom_domains" : "preview");
    },
  });
  assert.equal(result.changed, true);
  assert.equal(result.previousMode, "preview");
  assert.deepEqual(calls.map(({ method, path }) => ({ method, path })), [
    { method: "GET", path: `/v9/projects/${projectId}` },
    { method: "PATCH", path: `/v9/projects/${projectId}` },
    { method: "GET", path: `/v9/projects/${projectId}` },
  ]);
}

{
  let calls = 0;
  await assert.rejects(
    configureExactStagingVercelProtection({
      ...authority,
      projectId: "prj_wrong_project",
      request() {
        calls += 1;
        return project();
      },
    }),
    /not the pinned isolated staging authority/,
  );
  assert.equal(calls, 0, "a wrong input project must be blocked before any API request");
}

for (const [label, overrides] of [
  ["project id", { id: "prj_other" }],
  ["project name", { name: "production-project" }],
  ["organization", { accountId: "team_other" }],
]) {
  const calls = [];
  await assert.rejects(
    configureExactStagingVercelProtection({
      ...authority,
      request(call) {
        calls.push(call);
        return project("all_except_custom_domains", overrides);
      },
    }),
    /not the exact isolated staging project/,
    `wrong ${label} must fail closed`,
  );
  assert.deepEqual(calls.map((call) => call.method), ["GET"]);
}

{
  let readCount = 0;
  const calls = [];
  await assert.rejects(
    configureExactStagingVercelProtection({
      ...authority,
      request(call) {
        calls.push(call);
        if (call.method === "PATCH") return project("all_except_custom_domains");
        readCount += 1;
        return project(readCount === 1 ? "preview" : "all");
      },
    }),
    /did not reach the exact required mode/,
  );
  assert.deepEqual(calls.map((call) => call.method), ["GET", "PATCH", "GET"]);
}

{
  const calls = [];
  const result = await verifyExactStagingVercelProtection({
    ...authority,
    request(call) {
      calls.push(call);
      return project("all_except_custom_domains");
    },
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.readOnlyVerification, true);
  assert.equal(result.changed, false);
  assert.deepEqual(calls, [
    { method: "GET", path: `/v9/projects/${projectId}`, body: null },
  ]);
}

await assert.rejects(
  verifyExactStagingVercelProtection({
    ...authority,
    request() {
      return project("preview");
    },
  }),
  /drifted from the exact required mode/,
);

assert.equal(classifyStagingHostReadiness({ status: 200 }), "ready");
for (const status of [301, 302, 303, 307, 308]) {
  assert.throws(
    () => classifyStagingHostReadiness({ status, location: "/anything" }),
    StagingHostRedirectError,
    `HTTP ${status} must never satisfy staging readiness`,
  );
}
for (const status of [0, 201, 204, 400, 404, 409, 429, 500, 503]) {
  assert.equal(
    classifyStagingHostReadiness({ status }),
    "retry",
    `HTTP ${status} must not satisfy readiness`,
  );
}

console.log(
  "isolated staging Vercel protection contract: PASS (pinned project and organization, generated deployment URLs remain protected, production aliases require the application gate, exact PATCH and verification, direct HTTP 200 only, all redirects rejected)",
);
