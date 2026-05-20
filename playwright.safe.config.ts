import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.SAFE_E2E_BASE_URL?.trim() || "http://127.0.0.1:3100";
const shouldStartServer = !process.env.SAFE_E2E_BASE_URL?.trim();
const browserChannel = process.env.SAFE_E2E_BROWSER_CHANNEL?.trim();
const readinessURL = `${baseURL.replace(/\/$/, "")}/login`;
const serverCommand =
  process.env.SAFE_E2E_SERVER_COMMAND?.trim() ||
  "npm run build && npm run start -- --hostname 127.0.0.1 --port 3100";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["safe-self-serve.spec.ts"],
  timeout: 45_000,
  globalTimeout: 900_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "test-results/e2e-safe-report" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    ...(browserChannel ? { channel: browserChannel } : {}),
    screenshot: "off",
    video: "off",
    trace: "off",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  webServer: shouldStartServer
    ? {
        command: serverCommand,
        url: readinessURL,
        timeout: 600_000,
        stdout: "pipe",
        stderr: "pipe",
        reuseExistingServer: !process.env.CI,
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          SCHEMA_VALIDATION_MODE: "warn",
          ALLOW_OPENAI_IMAGE_GENERATION: "false",
          ALLOW_HEYGEN_VIDEO_GENERATION: "false",
          ALLOW_META_LIVE_LAUNCH: "false",
        },
      }
    : undefined,
});
