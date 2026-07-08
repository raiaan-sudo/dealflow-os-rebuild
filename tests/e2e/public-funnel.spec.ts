import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/login",
  "/privacy",
  "/terms",
];
const publicFunnelRoutes = ["/f/hamza-juma", "/f/homelife-hearts-realty-inc"];
const publicFunnelBaseURL = process.env.PUBLIC_FUNNEL_E2E_BASE_URL?.replace(/\/$/, "");
const canRenderLocalFunnels = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

test.describe("public read-only routes", () => {
  for (const route of publicRoutes) {
    test(`${route} loads without console errors or failed telemetry`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];

      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });

      page.on("response", (response) => {
        const url = response.url();
        if (url.includes("/api/client-errors") && response.status() >= 400) {
          failedRequests.push(`${response.status()} ${url}`);
        }
      });

      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toBeVisible();

      if (route.startsWith("/f/")) {
        await expect(page.locator("form").first()).toBeVisible();
        await expect(page.locator("text=/turnstile|verification challenge/i")).toHaveCount(0);
      }

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    });
  }
});

test.describe("public funnel read-only routes", () => {
  test.skip(!publicFunnelBaseURL && !canRenderLocalFunnels, "Public funnel E2E requires PUBLIC_FUNNEL_E2E_BASE_URL or local Supabase env.");

  for (const route of publicFunnelRoutes) {
    test(`${route} loads without console errors or failed telemetry`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];

      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });

      page.on("response", (response) => {
        const url = response.url();
        if (url.includes("/api/client-errors") && response.status() >= 400) {
          failedRequests.push(`${response.status()} ${url}`);
        }
      });

      const target = publicFunnelBaseURL ? `${publicFunnelBaseURL}${route}` : route;
      await page.goto(target, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("form").first()).toBeVisible();
      await expect(page.locator("text=/turnstile|verification challenge/i")).toHaveCount(0);

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    });
  }
});
