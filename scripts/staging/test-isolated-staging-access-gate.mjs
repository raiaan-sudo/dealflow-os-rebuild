#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const proxy = readFileSync(join(root, "src", "proxy.ts"), "utf8");
const nextConfigSource = readFileSync(join(root, "next.config.mjs"), "utf8");
const runner = readFileSync(
  join(root, "scripts", "staging", "run-isolated-staging-acceptance.mjs"),
  "utf8",
);
const optimizerSourceRoute = readFileSync(
  join(
    root,
    "src",
    "app",
    "staging-private-image-gate-proof-v2",
    "[commit]",
    "route.ts",
  ),
  "utf8",
);
const scenarioPath = join(
  root,
  "scripts",
  "staging",
  "staging-access-gate-scenario.ts",
);
const privateImageRouteScenarioPath = join(
  root,
  "scripts",
  "staging",
  "staging-private-image-gate-proof-route-scenario.ts",
);
const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const canonicalStagingProjectId = String(
  JSON.parse(readFileSync(join(root, ".vercel", "project.json"), "utf8"))
    .projectId,
);

assert.match(proxy, /isExactIsolatedStagingVercelHost\(\)/);
assert.match(proxy, /isStrongSecretValue\(secret\)/);
assert.match(proxy, /timingSafeTokenEquals\(headerCandidate, secret\)/);
assert.match(proxy, /timingSafeTokenEquals\(cookieCandidate, secret\)/);
assert.match(proxy, /requestHeaders\.delete\(STAGING_ACCESS_HEADER\)/);
assert.match(proxy, /requestHeaders\.delete\(VERCEL_PROTECTION_BYPASS_HEADER\)/);
assert.match(proxy, /requestHeaders\.delete\(VERCEL_SET_BYPASS_COOKIE_HEADER\)/);
assert.match(proxy, /VERCEL_AUTOMATION_BYPASS_COOKIE/);
assert.match(proxy, /removeCookieFromRequestHeader\(/);
assert.match(proxy, /STAGING_ACCESS_COOKIE/);
assert.match(proxy, /rawPathname === "\/_next"/);
assert.match(proxy, /rawPathname\.startsWith\("\/_next\/"\)/);
assert.match(proxy, /matcher: \["\/:path\*"\]/);
assert.match(proxy, /STAGING_PRIVATE_IMAGE_SOURCE_PATH_PREFIX/);
assert.match(proxy, /pathname\.startsWith\(STAGING_PRIVATE_IMAGE_SOURCE_PATH_PREFIX\)/);
assert.match(proxy, /rawPathname === DISABLED_STAGING_IMAGE_OPTIMIZER_PATH/);
assert.match(proxy, /rawPathname === NEXT_IMAGE_OPTIMIZER_PATH/);
assert.match(proxy, /rawPathname === STAGING_RETIRED_PUBLIC_IMAGE_SOURCE_PATH/);
assert.match(runner, /staging-private-image-gate-proof-v2\//);
assert.match(runner, /requestExactPrivateImageSource/);
assert.match(optimizerSourceRoute, /"Content-Type": "image\/png"/);
assert.match(optimizerSourceRoute, /"X-Content-Type-Options": "nosniff"/);
assert.match(optimizerSourceRoute, /isExactIsolatedStagingVercelHost\(\)/);
assert.match(optimizerSourceRoute, /NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT/);
assert.match(optimizerSourceRoute, /commit !== `\$\{expectedCommit\}\.png`/);
assert.match(optimizerSourceRoute, /status: 404/);
assert.match(optimizerSourceRoute, /"Cache-Control": "private, no-store, max-age=0"/);
const stagingDecisionSource = proxy.slice(
  proxy.indexOf("function getIsolatedStagingAccessDecision("),
  proxy.indexOf("function removeCookieFromRequestHeader("),
);
assert.doesNotMatch(stagingDecisionSource, /STAGING_PRIVATE_IMAGE_SOURCE_PATH/);
assert.doesNotMatch(proxy, /\(\?!_next\/static\|_next\/image\)/);
assert.match(proxy, /hostedProductionSlot && explicitlyStaging && !exactIsolatedStagingHost/);
assert.match(nextConfigSource, /resolveIsolatedStagingImageConfig/);
assert.match(nextConfigSource, /unoptimized: true/);
assert.match(nextConfigSource, /ISOLATED_STAGING_PROJECT_ID_SHA256/);
assert.match(nextConfigSource, /createHash\("sha256"\)\.update\(vercelProjectId\)/);
assert.match(nextConfigSource, /_dealflow-staging-image-optimizer-disabled/);
assert.match(nextConfigSource, /__dealflow-disabled-image-optimizer__/);
assert.match(nextConfigSource, /production receives no override/i);

const { resolveIsolatedStagingImageConfig } = await import(
  `${new URL("../../next.config.mjs", import.meta.url).href}?staging-image-config-contract`
);
const exactStagingImageConfig = resolveIsolatedStagingImageConfig({
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: canonicalStagingProjectId,
  DEALFLOW_STAGING_VERCEL_PROJECT_ID: canonicalStagingProjectId,
  DEALFLOW_STAGING_HOST_ATTESTATION:
    "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
});
assert.deepEqual(exactStagingImageConfig, {
  unoptimized: true,
  path: "/_dealflow-staging-image-optimizer-disabled",
  remotePatterns: [],
  localPatterns: [
    {
      pathname: "/__dealflow-disabled-image-optimizer__/**",
      search: "",
    },
  ],
});
assert.equal(
  resolveIsolatedStagingImageConfig({ DEALFLOW_DEPLOYMENT_TARGET: "production" }),
  undefined,
);
for (const environment of [
  { DEALFLOW_DEPLOYMENT_TARGET: "staging" },
  {
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    VERCEL_ENV: "preview",
    VERCEL_PROJECT_ID: canonicalStagingProjectId,
    DEALFLOW_STAGING_VERCEL_PROJECT_ID: canonicalStagingProjectId,
    DEALFLOW_STAGING_HOST_ATTESTATION:
      "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
  },
  {
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_ID: canonicalStagingProjectId,
    DEALFLOW_STAGING_VERCEL_PROJECT_ID: `${canonicalStagingProjectId}wrong`,
    DEALFLOW_STAGING_HOST_ATTESTATION:
      "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
  },
  {
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_ID: canonicalStagingProjectId,
    DEALFLOW_STAGING_VERCEL_PROJECT_ID: canonicalStagingProjectId,
    DEALFLOW_STAGING_HOST_ATTESTATION: "forged",
  },
]) {
  assert.throws(
    () => resolveIsolatedStagingImageConfig(environment),
    /without exact isolated-staging Vercel authority/,
  );
}

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory()
      ? listSourceFiles(absolute)
      : entry.isFile() && /\.(?:[cm]?js|jsx|tsx?)$/.test(entry.name)
        ? [absolute]
        : [];
  });
}

const sourceModuleInventory = listSourceFiles(join(root, "src"))
  .map((path) => ({
    path: relative(root, path),
    source: readFileSync(path, "utf8"),
  }))
  .map((entry) => ({
    ...entry,
    sourceFile: ts.createSourceFile(
      entry.path,
      entry.source,
      ts.ScriptTarget.Latest,
      true,
      entry.path.endsWith(".tsx")
        ? ts.ScriptKind.TSX
        : entry.path.endsWith(".jsx")
          ? ts.ScriptKind.JSX
          : entry.path.endsWith(".ts")
            ? ts.ScriptKind.TS
            : ts.ScriptKind.JS,
    ),
  }));

let nextImageModuleReferenceCount = 0;
for (const { path, sourceFile } of sourceModuleInventory) {
  const visitModuleReferences = (node) => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text === "next/image"
    ) {
      nextImageModuleReferenceCount += 1;
      assert.ok(
        ts.isImportDeclaration(node.parent) &&
          node.parent.moduleSpecifier === node &&
          node.parent.importClause?.name &&
          node.parent.importClause.namedBindings === undefined,
        `${path} contains a non-default or dynamic next/image module reference`,
      );
    }
    ts.forEachChild(node, visitModuleReferences);
  };
  visitModuleReferences(sourceFile);
}
assert.equal(nextImageModuleReferenceCount, 4);

const nextImageInventory = sourceModuleInventory
  .filter(({ sourceFile }) =>
    sourceFile.statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === "next/image",
    ),
  )
  .sort((left, right) => left.path.localeCompare(right.path));
assert.deepEqual(
  nextImageInventory.map(({ path }) => path),
  [
    "src/components/campaign/static-ad-composed-preview.tsx",
    "src/components/funnel/funnel-preview.tsx",
    "src/components/funnels/canonical-funnel-renderer.tsx",
    "src/components/ui/logo.tsx",
  ],
);
let nextImageJsxCount = 0;
for (const { path, sourceFile } of nextImageInventory) {
  const imports = sourceFile.statements.filter(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "next/image",
  );
  assert.equal(imports.length, 1, `${path} must have one next/image import`);
  const defaultImport = imports[0].importClause?.name?.text;
  assert.ok(defaultImport, `${path} must use a default next/image import`);
  assert.equal(
    imports[0].importClause?.namedBindings,
    undefined,
    `${path} must not mix named or namespace next/image imports`,
  );

  let fileImageJsxCount = 0;
  const visit = (node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === defaultImport
    ) {
      fileImageJsxCount += 1;
      nextImageJsxCount += 1;
      const attributes = node.attributes.properties;
      assert.equal(
        attributes.some((attribute) => ts.isJsxSpreadAttribute(attribute)),
        false,
        `${path} Next Image JSX must not use spread attributes`,
      );
      const unoptimized = attributes.filter(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.text === "unoptimized",
      );
      assert.equal(
        unoptimized.length,
        1,
        `${path} Next Image JSX must declare unoptimized exactly once`,
      );
      const initializer = unoptimized[0].initializer;
      assert.ok(
        initializer === undefined ||
          (ts.isJsxExpression(initializer) &&
            initializer.expression?.kind === ts.SyntaxKind.TrueKeyword),
        `${path} Next Image unoptimized must be bare or literal true`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(fileImageJsxCount > 0, `${path} must render its next/image import`);
}
assert.equal(nextImageJsxCount, 6);
assert.doesNotMatch(
  /const STAGING_NATIVE_PROVIDER_CALLBACK_PATHS = new Set\(\[([\s\S]*?)\]\);/.exec(proxy)?.[1] ?? "",
  /lead-capture/,
);
for (const path of [
  "/api/integrations/ghl/webhook",
  "/api/meta/data-deletion",
  "/api/meta/leadgen/webhook",
  "/api/sms/twilio",
  "/api/stripe/webhook",
  "/api/webhooks/twilio/status",
]) {
  assert.match(proxy, new RegExp(`"${path.replaceAll("/", "\\/")}"`));
}
assert.match(
  readFileSync(join(root, "src/app/api/meta/leadgen/webhook/route.ts"), "utf8"),
  /verifyMetaLeadgenWebhookSignature/,
);
assert.match(
  readFileSync(join(root, "src/app/api/meta/data-deletion/route.ts"), "utf8"),
  /parseSignedRequest/,
);
assert.match(
  readFileSync(join(root, "src/app/api/integrations/ghl/webhook/route.ts"), "utf8"),
  /verifyGhlWebhookSignature/,
);
assert.match(
  readFileSync(join(root, "src/app/api/stripe/webhook/route.ts"), "utf8"),
  /construct_webhook_event/,
);
for (const route of [
  "src/app/api/sms/twilio/route.ts",
  "src/app/api/webhooks/twilio/status/route.ts",
]) {
  assert.match(readFileSync(join(root, route), "utf8"), /validateTwilioWebhookSignature/);
}
assert.match(runner, /randomBytes\(48\)\.toString\("base64url"\)/);
assert.match(runner, /STAGING_ACCESS_GATE_SECRET: stagingAccessGateSecret/);
assert.match(runner, /withStagingAccess/);

for (const scenario of [
  "authorized",
  "authorized_static_header",
  "authorized_static_cookie",
  "wrong_static_header",
  "closed_image_header",
  "closed_image_cookie",
  "closed_disabled_image_no_gate",
  "closed_disabled_image_header",
  "closed_disabled_image_cookie",
  "wrong_image_cookie",
  "private_image_source_header",
  "private_image_source_cookie",
  "private_image_source_no_gate",
  "retired_image_source_no_gate",
  "retired_image_source_header",
  "retired_image_source_cookie",
  "authorized_next_internal_header",
  "authorized_next_internal_cookie",
  "wrong_next_internal_header",
  "authorized_cookie",
  "authorized_cookie_only",
  "unauthorized_cookie",
  "unauthorized_static",
  "unauthorized_image",
  "unauthorized_next_internal",
  "unauthorized",
  "missing_config",
  "weak_config",
  "wrong_project",
  "missing_project",
  "missing_attestation",
  "production_ungated",
  "production_static_ungated",
  "production_image_ungated",
  "native_callback",
  "lead_capture_blocked",
]) {
  const result = spawnSync(process.execPath, [tsxCli, scenarioPath, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/private/tmp",
      DEALFLOW_TEST_CANONICAL_STAGING_PROJECT_ID: canonicalStagingProjectId,
    },
  });
  assert.equal(
    result.status,
    0,
    `staging access scenario ${scenario} failed:\n${result.stderr}\n${result.stdout}`,
  );
  assert.match(result.stdout, new RegExp(`scenario ${scenario}: PASS`));
}

for (const scenario of [
  "exact-staging",
  "production",
  "forged-project",
  "forged-attestation",
  "wrong-commit",
]) {
  const result = spawnSync(
    process.execPath,
    [tsxCli, privateImageRouteScenarioPath, scenario],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? "/private/tmp",
        DEALFLOW_TEST_CANONICAL_STAGING_PROJECT_ID: canonicalStagingProjectId,
      },
    },
  );
  assert.equal(
    result.status,
    0,
    `staging private image proof route scenario ${scenario} failed:\n${result.stderr}\n${result.stdout}`,
  );
  assert.match(result.stdout, new RegExp(`staging private image proof route ${scenario}: PASS`));
}

console.log(
  "isolated staging access gate: PASS (private app, explicit direct images, closed optimizer paths, and lead-capture surface; fail-closed secret; no secret forwarding; production unaffected; exact native-signed provider callbacks remain reachable)",
);
