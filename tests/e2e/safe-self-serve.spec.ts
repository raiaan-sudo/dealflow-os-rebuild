import { expect, test, type Page } from "@playwright/test";

const QA_AUTH_ENABLED = process.env.SAFE_E2E_QA_AUTH === "true";
const INTERNAL_SECRET =
  process.env.INTERNAL_SYSTEM_JOBS_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
const QA_HARNESS_ENABLED = process.env.QA_AUTH_HARNESS_ENABLED === "true";

const modeExpectations = [
  {
    button: "Buyer leads",
    previewLabel: "Buyer campaign",
  },
  {
    button: "Seller leads",
    previewLabel: "Seller campaign",
  },
  {
    button: "Investor leads",
    previewLabel: "Investor campaign",
  },
  {
    button: "Commercial leads",
    previewLabel: "Commercial campaign",
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

    await page.goto("/");
    const appStartLink = page.getByRole("link", { name: /Start building/i });
    const marketingStartLink = page.getByRole("link", { name: /Get Access|See the system/i }).first();
    if (await appStartLink.count()) {
      await appStartLink.click();
      await expect(page).toHaveURL(/\/login\?mode=sign-up&redirectedFrom=%2Fwelcome%3Ffresh%3D1/);
    } else {
      await marketingStartLink.click();
      await expect(page).toHaveURL(/app\.agentdealflow\.io\/login|\/login/);
    }

    await page.goto("/");
    const openAppLink = page.getByRole("link", { name: /Open app/i });
    if (await openAppLink.count()) {
      await openAppLink.click();
      await expect(page).toHaveURL(/\/login\?reason=(expired|setup)&redirectedFrom=%2Fdashboard/);
    } else {
      await expect(page.getByRole("link", { name: /Get Access|See the system/i }).first()).toBeVisible();
    }

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /Privacy/i })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /Terms/i })).toBeVisible();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?reason=(expired|setup)&redirectedFrom=%2Fdashboard/);
    await expect(
      page.getByText(/Your session expired or could not be refreshed|Configure Supabase before accessing protected routes/),
    ).toBeVisible();

    await page.goto("/launch");
    await expect(page).toHaveURL(/\/login\?reason=(expired|setup)&redirectedFrom=%2Flaunch/);

    await page.goto("/admin/issues");
    await expect(page).toHaveURL(/\/login\?reason=(expired|setup)&redirectedFrom=%2Fadmin%2Fissues/);

    await page.goto("/admin/command-center");
    await expect(page).toHaveURL(/\/login\?reason=(expired|setup)&redirectedFrom=%2Fadmin%2Fcommand-center/);
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
    await expect(page.getByRole("heading", { name: "Choose campaign type" })).toBeVisible();
    const preview = page.getByTestId("prepaywall-campaign-preview").first();
    await expect(preview.getByText("Campaign preview")).toBeVisible();
    await expect(preview.getByText("Ad preview")).toBeVisible();
    await expect(preview.getByText("Funnel assembling")).toBeVisible();
    await expect(page.getByText("Full generation unlocks after checkout and credits")).toBeVisible();
    await expect(page.getByText("Offer coach")).toHaveCount(0);
    await expect(preview.getByText(/AI image.*locked/i)).toBeVisible();
    await expect(preview.getByText(/AI video.*locked/i)).toBeVisible();
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
      await expect(
        page.getByRole("button", { name: new RegExp(`${mode.button}[\\s\\S]*Selected`, "i") }),
      ).toBeVisible();
      await expect(preview.getByText(mode.previewLabel)).toBeVisible();
    }

    await continueTo(page, /Continue to market/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByLabel("City or market")).toBeVisible();
    await page.getByLabel("City or market").fill("Austin, TX");
    await continueTo(page, /Continue to property/i);
    await expectNoHorizontalOverflow(page);
    const officeProperty = page.getByRole("button", { name: /^Office\b/i });
    await expect(officeProperty).toBeVisible();
    await expect(page.getByRole("button", { name: /^Warehouse\b/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Owner-user\b/i })).toBeVisible();
    await officeProperty.click();
    await continueTo(page, /Continue to offer/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("We chose this because", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Available spaces shortlist", exact: true })).toBeVisible();
    await expect(page.getByText("Offer coach")).toBeVisible();
    await page.getByLabel("Recommended audience").fill("QA commercial prospects comparing launch-safe DealFlow previews");
    await page.getByLabel("Offer or lead magnet").fill("Guaranteed approvl for 600 n up credit");
    await page.getByRole("button", { name: /Use polished offer/i }).click();
    await expect(page.getByLabel("Offer or lead magnet")).toHaveValue("Guaranteed Approval for 600+ Credit");
    await continueTo(page, /Continue to agent/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByLabel("Agent first name")).toBeVisible();
    await expect(page.getByLabel("Company or brokerage")).toBeVisible();

    await page.getByLabel("Agent first name").fill("Safe");
    await page.getByLabel("Agent last name").fill("Browser");
    await page.getByLabel("Company or brokerage").fill("DealFlow QA Realty");
    await page.getByLabel("SMS alert phone").fill("555-010-2000");
    await continueTo(page, /Continue to plan/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("Starter $147/mo")).toBeVisible();
    await expect(page.getByText("Pro $297/mo")).toBeVisible();
    await expect(page.getByText("Recommended optimization").first()).toBeVisible();
    await expect(page.getByText("Fully covered + self-optimizing").first()).toBeVisible();
    await page.getByRole("button", { name: /Starter \$147\/mo/i }).click();
    await continueTo(page, /Continue to review/i);
    await expectNoHorizontalOverflow(page);

    await expect(page.getByText("Ready to build campaign preview")).toBeVisible();
    await expect(page.getByText("Launch readiness summary")).toBeVisible();
    await expect(page.getByText("Full-resolution files locked")).toBeVisible();
    await expect(page.getByText("No live ad, payment, message, or media action runs here.")).toBeVisible();
    await continueTo(page, /Continue to checkout/i);
    await expect(page).toHaveURL(/\/paywall\?campaignId=.*&plan=starter/);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("Starter · $147/mo")).toBeVisible();
    await expect(page.getByText("Recommended optimization").first()).toBeVisible();

    await page.goto("/paywall?plan=pro");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("Pro · $297/mo")).toBeVisible();
    await expect(page.getByText("fully covered", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Campaign context needed")).toBeVisible();
    await expect(page.getByRole("button", { name: /Build preview first/i })).toBeDisabled();

    await page.goto("/dashboard");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText(/Dashboard|campaign/i).first()).toBeVisible();
    await expect(page.getByText("Layout behavior comparison")).toHaveCount(0);

    await page.goto("/launch");
    await expectNoHorizontalOverflow(page);
    await expect(
      page.getByText(/Campaign plan not found|Final review before launch|Activate billing before launch|Selected creative required/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Connect Meta|Meta connection required|Build a campaign before moving into launch|Choose an ad in creatives/i).first(),
    ).toBeVisible();

    await expect(page.getByRole("link", { name: /Ready to attempt launch/i })).toHaveCount(0);
  });
});
