import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { assertZeroExternalEffectsEnvironment } from "./src/lib/safety/zero-external-effects";
import { assertExactHostedSafeBrowserOrigin } from "./scripts/staging/safe-browser-host-contract.mjs";
import { exactVercelAutomationProtectionPortfolio } from "./scripts/staging/browser-context-network-boundary.mjs";
import { LOCAL_SAFE_SERVER_ENVIRONMENT } from "./tests/e2e/safe-browser-environment";

const configuredBaseUrl = process.env.SAFE_E2E_BASE_URL?.trim();
const baseURL = configuredBaseUrl
  ? assertExactHostedSafeBrowserOrigin(configuredBaseUrl).origin
  : "http://127.0.0.1:3410";
const shouldStartServer = !configuredBaseUrl;
const browserChannel = process.env.SAFE_E2E_BROWSER_CHANNEL?.trim();
const vercelProtectionPortfolio = configuredBaseUrl
  ? exactVercelAutomationProtectionPortfolio({
      applicationOrigins: [baseURL],
      serializedPortfolio:
        process.env.VERCEL_AUTOMATION_PROTECTION_PORTFOLIO ?? "",
    })
  : [];
const vercelAutomationBypassRequired = vercelProtectionPortfolio.some(
  ({ vercelAutomationBypassRequired: required }) => required,
);
const vercelAutomationBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
if (
  configuredBaseUrl &&
  (vercelAutomationBypassRequired
    ? vercelAutomationBypassSecret.length < 32 ||
      vercelAutomationBypassSecret.trim() !== vercelAutomationBypassSecret ||
      !/^[\x21-\x7e]+$/.test(vercelAutomationBypassSecret)
    : vercelAutomationBypassSecret !== "")
) {
  throw new Error("Hosted safe browser proof has inexact Vercel automation bypass authority");
}
const artifactRoot = process.env.SAFE_E2E_OUTPUT_DIR?.trim() ||
  join(tmpdir(), `dealflow-playwright-safe-${process.pid}`);
process.env.SAFE_E2E_RESOLVED_OUTPUT_DIR = artifactRoot;

if (shouldStartServer) {
  assertZeroExternalEffectsEnvironment(LOCAL_SAFE_SERVER_ENVIRONMENT);
  Object.assign(process.env, LOCAL_SAFE_SERVER_ENVIRONMENT, {
    SAFE_E2E_QA_AUTH: "false",
  });
}

function project(
  name: string,
  device: (typeof devices)[keyof typeof devices],
) {
  return {
    name,
    use: {
      ...device,
      ...(browserChannel ? { channel: browserChannel } : {}),
    },
  };
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["dealflow-safe.spec.ts"],
  globalSetup: "./tests/e2e/global-safety-preflight.ts",
  outputDir: join(artifactRoot, "artifacts"),
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ["list"],
    ["json", { outputFile: join(artifactRoot, "playwright-results.json") }],
    ["junit", { outputFile: join(artifactRoot, "playwright-results.xml") }],
    ["html", { open: "never", outputFolder: join(artifactRoot, "report") }],
    [resolve("tests/e2e/safe-acceptance-reporter.mjs")],
  ],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 25_000,
    screenshot: "on",
    // Hosted QA setup uses restricted internal authorization. Keep it out of
    // browser traces; JSON/JUnit, screenshots, and the sanitized safety proof
    // remain the authoritative hosted evidence.
    trace: configuredBaseUrl ? "off" : "retain-on-failure",
    video: "off",
    serviceWorkers: "block",
    // Never place the Vercel bypass secret in global browser request headers.
    // Each hosted BrowserContext primes one host-only cookie through the
    // exact-origin, no-redirect boundary before any page navigation.
  },
  projects: [
    project("desktop-chromium", devices["Desktop Chrome"]),
    project("mobile-chromium", devices["Pixel 7"]),
    project("desktop-firefox", devices["Desktop Firefox"]),
    project("desktop-webkit", devices["Desktop Safari"]),
  ],
  webServer: shouldStartServer
    ? {
        command:
          "npm run build && npm run start -- --hostname 127.0.0.1 --port 3410",
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: LOCAL_SAFE_SERVER_ENVIRONMENT,
      }
    : undefined,
});
