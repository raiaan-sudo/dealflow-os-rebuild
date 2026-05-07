import { expect, test, type Page } from "@playwright/test";

const QA_AUTH_ENABLED = process.env.SAFE_E2E_QA_AUTH === "true";
const INTERNAL_SECRET =
  process.env.INTERNAL_SYSTEM_JOBS_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
const QA_HARNESS_ENABLED = process.env.QA_AUTH_HARNESS_ENABLED === "true";

const modeExpectations = [
  {
    button: "Buyer leads",
    path: "Buyer leads in the selected market",
  },
  {
    button: "Seller leads",
    path: "Seller leads in the selected market",
  },
  {
    button: "Investor leads",
    path: "Investor prospects who want deal flow",
  },
  {
    button: "Commercial leads",
    path: "Commercial clients evaluating lease",
  },
];

async function establishQaSession(page: Page) {
  const response = await page.request.post("/api/internal/qa-auth-session", {
    headers: {
      authorization: `Bearer ${INTERNAL_SECRET}`,
    },
  });

  expect(response.ok(), `QA auth harness should return 2xx, got ${response.status()}`).toBeTruthy();
  const payload = (await response.json()) as { success?: boolean; cookieCount?: number };
  expect(payload.success).toBe(true);
  expect(payload.cookieCount ?? 0).toBeGreaterThan(0);
}

async function continueTo(page: Page, label: RegExp) {
  await page.getByRole("button", { name: label }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

test.describe("safe public browser proof", () => {
  test("public shell and protected-route gates are browser-reachable without side effects", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Build, launch, and optimize your ads")).toBeVisible();

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /Privacy/i })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /Terms/i })).toBeVisible();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?reason=expired&redirectedFrom=%2Fdashboard/);
    await expect(page.getByText("Your session expired or could not be refreshed")).toBeVisible();

    await page.goto("/launch");
    await expect(page).toHaveURL(/\/login\?reason=expired&redirectedFrom=%2Flaunch/);

    await page.goto("/admin/issues");
    await expect(page).toHaveURL(/\/login\?reason=expired&redirectedFrom=%2Fadmin%2Fissues/);

    await page.goto("/admin/command-center");
    await expect(page).toHaveURL(/\/login\?reason=expired&redirectedFrom=%2Fadmin%2Fcommand-center/);
  });
});

test.describe("safe authenticated self-serve journey", () => {
  test.skip(
    !QA_AUTH_ENABLED || !QA_HARNESS_ENABLED || !INTERNAL_SECRET,
    "Set SAFE_E2E_QA_AUTH=true, QA_AUTH_HARNESS_ENABLED=true, QA_EMAIL, Supabase service-role env, and INTERNAL_SYSTEM_JOBS_SECRET/CRON_SECRET to run the authenticated safe journey.",
  );

  test("onboarding, preview modes, paywall, dashboard, and launch gates work without real-world side effects", async ({ page }) => {
    await establishQaSession(page);

    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: /Step-by-step campaign builder/i })).toBeVisible();
    await expect(page.getByText("Choose campaign type")).toBeVisible();
    await expect(page.getByText("DealFlow is building this from your answers")).toBeVisible();
    await expect(page.getByText("DealFlow Preview")).toBeVisible();
    await expect(page.getByText("Funnel assembling")).toBeVisible();
    await expect(page.getByText("Full generation unlocks after checkout and credits")).toBeVisible();
    await expect(page.getByText("Sample CTA:", { exact: false })).toBeVisible();
    await expect(page.getByText("AI image locked")).toBeVisible();
    await expect(page.getByText("UGC locked")).toBeVisible();
    await expect(page.getByRole("button", { name: /download|export/i })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    const stepPanel = await page.getByTestId("onboarding-current-step-panel").boundingBox();
    const previewPanel = await page.getByTestId("prepaywall-campaign-preview").first().boundingBox();
    expect(stepPanel, "current step panel should be measurable").not.toBeNull();
    expect(previewPanel, "pre-paywall preview panel should be measurable").not.toBeNull();
    if (stepPanel && previewPanel) {
      expect(previewPanel.height).toBeLessThanOrEqual(stepPanel.height * 1.5);
    }

    for (const mode of modeExpectations) {
      await page.getByRole("button", { name: new RegExp(mode.button, "i") }).click();
      await expect(page.getByText(mode.path, { exact: false })).toBeVisible();
    }

    await continueTo(page, /Continue to market/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByLabel("City or market")).toBeVisible();
    await page.getByLabel("City or market").fill("Austin, TX");
    await continueTo(page, /Continue to property/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("button", { name: /Office/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Warehouse/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Owner-user/i })).toBeVisible();
    await page.getByRole("button", { name: /Office/i }).click();
    await continueTo(page, /Continue to offer/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("We chose this because", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /Available spaces shortlist/i })).toBeVisible();
    await page.getByLabel("Recommended audience").fill("QA commercial prospects comparing launch-safe DealFlow previews");
    await page.getByLabel("Offer or lead magnet").fill("QA launch-safe market brief");
    await continueTo(page, /Continue to agent/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("Add the agent first name.")).toBeVisible();
    await expect(page.getByText("Add the company or brokerage.")).toBeVisible();

    await page.getByLabel("Agent first name").fill("Safe");
    await page.getByLabel("Agent last name").fill("Browser");
    await page.getByLabel("Company or brokerage").fill("DealFlow QA Realty");
    await page.getByLabel("SMS alert phone").fill("555-010-2000");
    await continueTo(page, /Continue to plan/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("Starter $147/mo")).toBeVisible();
    await expect(page.getByText("Pro $297/mo")).toBeVisible();
    await page.getByRole("button", { name: /Starter \$147\/mo/i }).click();
    await continueTo(page, /Continue to review/i);
    await expectNoHorizontalOverflow(page);

    await expect(page.getByText("Ready to build campaign preview")).toBeVisible();
    await expect(page.getByText("Launch readiness summary")).toBeVisible();
    await expect(page.getByText("Full-resolution files locked")).toBeVisible();
    await expect(page.getByText("No live provider action runs here.")).toBeVisible();
    await continueTo(page, /Continue to checkout/i);
    await expect(page).toHaveURL(/\/paywall\?campaignId=.*&plan=starter/);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("Starter · $147/mo")).toBeVisible();
    await expect(page.getByText("Guided recommendations and launch access")).toBeVisible();

    await page.goto("/paywall?plan=pro");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("Pro · $297/mo")).toBeVisible();
    await expect(page.getByText("autonomous operator controls", { exact: false })).toBeVisible();
    await expect(page.getByText("Campaign context needed")).toBeVisible();
    await expect(page.getByRole("button", { name: /Build preview first/i })).toBeDisabled();

    await page.goto("/dashboard");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText(/Dashboard|campaign/i).first()).toBeVisible();
    await expect(page.getByText("Layout behavior comparison")).toHaveCount(0);

    await page.goto("/launch");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText(/Campaign plan not found|Final review before launch|Activate billing before launch/i).first()).toBeVisible();
    await expect(page.getByText(/Connect Meta|Meta connection required|Build a campaign before moving into launch/i).first()).toBeVisible();

    await expect(page.getByRole("link", { name: /Ready to attempt launch/i })).toHaveCount(0);
  });
});
