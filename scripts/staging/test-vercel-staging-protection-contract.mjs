#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  StagingHostRedirectError,
  classifyStagingHostReadiness,
  configureExactStagingVercelProtection,
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
const project = (mode = "preview", overrides = {}) => ({
  id: projectId,
  name: projectName,
  accountId: organizationId,
  ssoProtection: { deploymentType: mode },
  ...overrides,
});

{
  const calls = [];
  const result = configureExactStagingVercelProtection({
    ...authority,
    request(call) {
      calls.push(call);
      return project();
    },
  });
  assert.equal(result.changed, false);
  assert.equal(result.requiredMode, "preview");
  assert.deepEqual(calls, [
    { method: "GET", path: `/v9/projects/${projectId}`, body: null },
    { method: "GET", path: `/v9/projects/${projectId}`, body: null },
  ]);
}

{
  const calls = [];
  let configured = false;
  const result = configureExactStagingVercelProtection({
    ...authority,
    request(call) {
      calls.push(call);
      if (call.method === "PATCH") {
        assert.equal(call.path, `/v9/projects/${projectId}`);
        assert.deepEqual(call.body, {
          ssoProtection: { deploymentType: "preview" },
        });
        configured = true;
        return project("preview");
      }
      return project(configured ? "preview" : "all_except_custom_domains");
    },
  });
  assert.equal(result.changed, true);
  assert.equal(result.previousMode, "all_except_custom_domains");
  assert.deepEqual(calls.map(({ method, path }) => ({ method, path })), [
    { method: "GET", path: `/v9/projects/${projectId}` },
    { method: "PATCH", path: `/v9/projects/${projectId}` },
    { method: "GET", path: `/v9/projects/${projectId}` },
  ]);
}

{
  let calls = 0;
  assert.throws(
    () => configureExactStagingVercelProtection({
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
  assert.throws(
    () => configureExactStagingVercelProtection({
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
  assert.throws(
    () => configureExactStagingVercelProtection({
      ...authority,
      request(call) {
        calls.push(call);
        if (call.method === "PATCH") return project("preview");
        readCount += 1;
        return project(readCount === 1 ? "all_except_custom_domains" : "all");
      },
    }),
    /remain behind Vercel SSO protection/,
  );
  assert.deepEqual(calls.map((call) => call.method), ["GET", "PATCH", "GET"]);
}

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
  "isolated staging Vercel protection contract: PASS (pinned project and organization, exact PATCH path/body, post-write verification, preview protection preserved, direct HTTP 200 only, all redirects rejected)",
);
