#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS,
  assertExactStagingImageBuildInputInventory,
  assertStaticImageBuildSourceSafety,
  isPotentialDynamicImageSource,
} from "./staging-image-build-input-contract.mjs";

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
assert.doesNotMatch(
  /stagingAccess\.required[\s\S]*?return applySecurityHeaders\(/.exec(proxy)?.[0] ?? "",
  /NEXT_IMAGE_OPTIMIZER_PATH/,
);
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
assert.match(nextConfigSource, /disableStaticImages: true/);
assert.match(nextConfigSource, /ISOLATED_STAGING_PROJECT_ID_SHA256/);
assert.match(nextConfigSource, /createHash\("sha256"\)\.update\(vercelProjectId\)/);
assert.match(nextConfigSource, /_dealflow-staging-image-optimizer-disabled/);
assert.match(nextConfigSource, /localPatterns: \[\]/);
assert.match(nextConfigSource, /undefined would allow local sources/);
assert.match(nextConfigSource, /production receives[\s/]*no override/i);

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
  disableStaticImages: true,
  path: "/_dealflow-staging-image-optimizer-disabled",
  remotePatterns: [],
  localPatterns: [],
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

const deployableManifest = JSON.parse(
  readFileSync(join(root, "config", "release", "deployable-source-manifest.json"), "utf8"),
);
const imageBuildInputProof = assertExactStagingImageBuildInputInventory({
  root,
  deployablePaths: deployableManifest.entries.map(({ path }) => path),
});
assert.equal(imageBuildInputProof.optimizerEligibleStaticMediaAssetCount, 0);
assert.equal(imageBuildInputProof.sourceNextConfigLocalPatternsDenyAll, true);
assert.equal(imageBuildInputProof.sourceNextConfigRemotePatternsDenyAll, true);
assert.equal(imageBuildInputProof.vercelNativeOptimizerConstructionReferenceCount, 0);
assert.equal(imageBuildInputProof.nextImageModuleReferenceCount, 4);
assert.equal(imageBuildInputProof.nextImageJsxCount, 6);
assert.equal(
  imageBuildInputProof.approvedDirectPublicAssetCount,
  APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS.length,
);
for (const source of [
  `import hero from "./hero.png"; export default hero;`,
  `export { default as hero } from "./hero.webp";`,
  `const hero = require("./hero.jpg");`,
  `const hero = import("./hero.avif");`,
  `const hero = new URL("./hero.svg", import.meta.url);`,
  `const hero = new URL(\`./\${name}.png\`, import.meta.url);`,
  `import Legacy from "next/legacy/image"; export default Legacy;`,
  `import { getImageProps as renamed } from "next/image"; renamed({});`,
  `const Image = require("next/image");`,
  `const Image = require("next/" + "image").default;`,
  `const Image = require(\`next/\${kind}\`).default;`,
  `const Image = (await import("next/" + "image")).default;`,
  `const Image = (await import(\`next/\${kind}\`)).default;`,
  `import { Image } from "./shared/lib/image-external"; export default Image;`,
  `export { Image } from "./shared/lib/image-external";`,
  `const Image = require("./shared/lib/image-external").Image;`,
  `const Image = (await import("./shared/lib/image-external")).Image;`,
  `import Image from "@/client/image-component"; export default Image;`,
  `import { getImgProps } from "@/shared/lib/get-img-props"; getImgProps({});`,
  `import Image from "src/client/image-component"; export default Image;`,
  `import loader from "next/dist/shared/lib/image-loader"; export default loader;`,
  `import { getImgProps } from "next/dist/shared/lib/get-img-props"; getImgProps({});`,
  `const endpoint = "/_next/static/media/hero.123.png";`,
  `const endpoint = "/_next/image?url=%2Flogo.svg&w=32&q=75";`,
  `const endpoint = \`/_next/image?url=\${source}&w=32&q=75\`;`,
  `const endpoint = "/_vercel/image?url=%2Flogo.svg&w=32&q=75";`,
  `const endpoint = \`/_vercel/image?url=\${source}&w=32&q=75\`;`,
  `const endpoint = "/_vercel/" + "image?url=%2Flogo.svg&w=32&q=75";`,
  `const responsive = "/_vercel/image?url=%2Flogo.svg&w=32&q=75 1x, /logo.svg 2x";`,
  `export default () => <img srcSet="/_vercel/image?url=%2Flogo.svg&w=32&q=75 1x" alt="x" />;`,
  `export default () => <picture><source srcSet="/_vercel/image?url=%2Flogo.svg&w=32&q=75 1x" /><img src="/logo.svg" alt="x" /></picture>;`,
  `export default () => <link rel="preload" as="image" imageSrcSet="/_vercel/image?url=%2Flogo.svg&w=32&q=75 1x" />;`,
  `const background = "url('/_vercel/image?url=%2Flogo.svg&w=32&q=75')";`,
  `const background = "url('./hero.png')";`,
  `export default () => <img src="./hero.png" alt="x" />;`,
  `import Image from "next/image"; const Wrapped = Image; export default () => <Image unoptimized src="/logo.svg" alt="x" />;`,
  `import Image from "next/image"; export default () => <Image {...{ unoptimized: true }} src="/logo.svg" alt="x" />;`,
  `import Image from "next/image"; export default () => <Image unoptimized={false} src="/logo.svg" alt="x" />;`,
]) {
  assert.throws(
    () => assertStaticImageBuildSourceSafety({ path: "src/negative.tsx", source }),
    /image|Image|static media|optimizer/i,
  );
}
for (const source of [
  `return new Response(body, { headers: { "content-type": "image/png" } });`,
  `const headers = new Headers(); headers.set("content-type", "image/webp");`,
  `const headers = new Headers({ "CONTENT-TYPE": image.contentType });`,
  `import { ImageResponse } from "next/og"; return new ImageResponse(<div />);`,
]) {
  assert.equal(
    isPotentialDynamicImageSource({
      path: "src/app/api/future-image/route.ts",
      source,
    }),
    true,
  );
}
assert.equal(
  isPotentialDynamicImageSource({
    path: "src/app/api/json/route.ts",
    source: `return Response.json({ ok: true });`,
  }),
  false,
);
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
  "authorized_default_image_header",
  "authorized_default_image_cookie",
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
  "query",
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
  "isolated staging access gate: PASS (private app, exact direct-image inventory, deny-all staging image inputs, strict provider-edge rejection contract, custom optimizer closed, and lead-capture surface; fail-closed secret; no secret forwarding; production unaffected; exact native-signed provider callbacks remain reachable)",
);
