import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseURL = process.env.STAGING_ACCEPTANCE_BASE_URL?.trim();
if (!baseURL) {
  throw new Error("STAGING_ACCEPTANCE_BASE_URL is required for isolated staging acceptance");
}

const expectedHost = "dealflow-os-rebuild-selfserve-clean.vercel.app";
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
  parsedPartnerBaseUrl.hostname === expectedHost ||
  !parsedPartnerBaseUrl.hostname.startsWith("dealflow-os-rebuild-selfserve-clean-") ||
  !parsedPartnerBaseUrl.hostname.endsWith(".vercel.app") ||
  parsedPartnerBaseUrl.origin !== partnerBaseURL
) {
  throw new Error("White-label staging proof requires a distinct deployment-bound Vercel host");
}
const secondPartnerBaseURL = process.env.STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL?.trim();
if (!secondPartnerBaseURL) {
  throw new Error("STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL is required for partner isolation proof");
}
const parsedSecondPartnerBaseUrl = new URL(secondPartnerBaseURL);
if (
  parsedSecondPartnerBaseUrl.protocol !== "https:" ||
  parsedSecondPartnerBaseUrl.hostname !==
    "dealflow-os-rebuild-selfserve-clean-partner-two-qibh.vercel.app" ||
  parsedSecondPartnerBaseUrl.origin !== secondPartnerBaseURL ||
  parsedSecondPartnerBaseUrl.hostname === parsedPartnerBaseUrl.hostname
) {
  throw new Error("Second white-label staging proof requires the exact isolated partner-two alias");
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
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
