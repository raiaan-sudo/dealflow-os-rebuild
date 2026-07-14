import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exactVercelAutomationProtectionPortfolio } from "./scripts/staging/browser-context-network-boundary.mjs";

const baseURL = process.env.STAGING_ACCEPTANCE_BASE_URL?.trim();
if (!baseURL) {
  throw new Error("STAGING_ACCEPTANCE_BASE_URL is required for isolated staging acceptance");
}

const expectedHost = "dealflow-os-rebuild-selfserve-clean.vercel.app";
const expectedPartnerOneHost =
  "dealflow-os-rebuild-selfserve-clean-partner-one-qibh.vercel.app";
const expectedPartnerTwoHost =
  "dealflow-os-rebuild-selfserve-clean-partner-two-qibh.vercel.app";
const parsedBaseUrl = new URL(baseURL);
if (
  parsedBaseUrl.protocol !== "https:" ||
  parsedBaseUrl.hostname !== expectedHost ||
  parsedBaseUrl.origin !== baseURL
) {
  throw new Error("Staging browser acceptance requires the exact isolated Vercel staging host");
}
const partnerBaseURL = process.env.STAGING_ACCEPTANCE_PARTNER_BASE_URL?.trim();
if (!partnerBaseURL) {
  throw new Error("STAGING_ACCEPTANCE_PARTNER_BASE_URL is required for white-label staging proof");
}
const parsedPartnerBaseUrl = new URL(partnerBaseURL);
if (
  parsedPartnerBaseUrl.protocol !== "https:" ||
  parsedPartnerBaseUrl.hostname !== expectedPartnerOneHost ||
  parsedPartnerBaseUrl.origin !== partnerBaseURL
) {
  throw new Error("White-label staging proof requires the exact app-gated partner-one alias");
}
const secondPartnerBaseURL = process.env.STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL?.trim();
if (!secondPartnerBaseURL) {
  throw new Error("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL is required for partner isolation proof");
}
const parsedSecondPartnerBaseUrl = new URL(secondPartnerBaseURL);
if (
  parsedSecondPartnerBaseUrl.protocol !== "https:" ||
  parsedSecondPartnerBaseUrl.hostname !== expectedPartnerTwoHost ||
  parsedSecondPartnerBaseUrl.origin !== secondPartnerBaseURL
) {
  throw new Error("Second white-label staging proof requires the exact isolated partner-two alias");
}
const vercelProtectionPortfolio = exactVercelAutomationProtectionPortfolio({
  applicationOrigins: [
    parsedBaseUrl.origin,
    parsedPartnerBaseUrl.origin,
    parsedSecondPartnerBaseUrl.origin,
  ],
  serializedPortfolio:
    process.env.VERCEL_AUTOMATION_PROTECTION_PORTFOLIO ?? "",
});
const vercelAutomationBypassRequired = vercelProtectionPortfolio.some(
  ({ vercelAutomationBypassRequired: required }) => required,
);
const vercelAutomationBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
if (
  vercelAutomationBypassRequired
    ? vercelAutomationBypassSecret.length < 32 ||
      vercelAutomationBypassSecret.trim() !== vercelAutomationBypassSecret ||
      !/^[\x21-\x7e]+$/.test(vercelAutomationBypassSecret)
    : vercelAutomationBypassSecret !== ""
) {
  throw new Error("Staging browser proof has inexact Vercel automation bypass authority");
}

const outputRoot = process.env.STAGING_ACCEPTANCE_PLAYWRIGHT_OUTPUT_DIR?.trim() ||
  join(tmpdir(), `dealflow-staging-acceptance-${process.pid}`);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["dealflow-staging-acceptance.spec.ts"],
  outputDir: join(outputRoot, "artifacts"),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ["line"],
    ["json", { outputFile: join(outputRoot, "results.json") }],
    ["junit", { outputFile: join(outputRoot, "results.xml") }],
    ["html", { open: "never", outputFolder: join(outputRoot, "report") }],
  ],
  use: {
    baseURL,
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
    screenshot: "on",
    // Credential entry is intentionally never retained in traces.
    trace: "off",
    video: "off",
    serviceWorkers: "block",
    // The bypass secret belongs only on exact-origin, no-redirect
    // cookie-priming requests in the test context, never global headers.
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
