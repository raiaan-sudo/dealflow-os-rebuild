import { expect, type Page, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/login",
  "/privacy",
  "/terms",
];
const publicFunnelRoutes = ["/f/hamza-juma", "/f/homelife-hearts-realty-inc"];
const publicFunnelBaseURL = process.env.PUBLIC_FUNNEL_E2E_BASE_URL?.replace(/\/$/, "");
const canRenderLocalFunnels = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

async function gotoPublicRoute(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();

  try {
    await page.waitForLoadState("load", { timeout: 15_000 });
  } catch {
    // Some public pages intentionally keep third-party verification or telemetry
    // connections open. The route is considered loaded once DOM and body render.
  }
}

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

      await gotoPublicRoute(page, route);

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
      await gotoPublicRoute(page, target);
      await expect(page.locator("form").first()).toBeVisible();
      await expect(page.locator("text=/turnstile|verification challenge/i")).toHaveCount(0);

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    });
  }
});
