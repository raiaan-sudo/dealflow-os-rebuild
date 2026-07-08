import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "/tmp/dealflow-autonomous-remediation-proof/playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-mobile-390",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 30_000,
        env: {
          SCHEMA_VALIDATION_MODE: "warn",
        },
      },
});
