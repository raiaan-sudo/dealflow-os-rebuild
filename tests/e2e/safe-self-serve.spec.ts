import { expect, test, type Page } from "@playwright/test";

const QA_AUTH_ENABLED = process.env.SAFE_E2E_QA_AUTH === "true";
const INTERNAL_SECRET =
  process.env.QA_AUTH_PROOF_SECRET?.trim() ||
  process.env.INTERNAL_SYSTEM_JOBS_SECRET?.trim() ||
  process.env.CRON_SECRET?.trim() ||
  "";
const QA_HARNESS_ENABLED = process.env.QA_AUTH_HARNESS_ENABLED === "true";

const modeExpectations = [
  "Buyer leads",
  "Seller leads",
  "Investor leads",
  "Commercial leads",
];

async function establishQaSession(page: Page) {
  const response = await page.request.post("/api/internal/qa-auth-session", {
    headers: {
      authorization: `Bearer ${INTERNAL_SECRET}`,
    },
    timeout: 10_000,
  });

  const body = await response.text();
  let payload: { success?: boolean; cookieCount?: number; code?: string; error?: string } = {};
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    payload = { error: body.slice(0, 240) };
  }

  expect(
    response.ok(),
    `QA auth harness should return 2xx, got ${response.status()} code=${payload.code ?? "none"} error=${payload.error ?? "none"}`,
  ).toBeTruthy();
  expect(payload.success).toBe(true);
  expect(payload.cookieCount ?? 0).toBeGreaterThan(0);
}

async function disableActivationTelemetryWrites(page: Page) {
  await page.route("**/api/activation/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, recorded: false, safeE2e: true }),
    });
  });
}

async function disableClientErrorTelemetryWrites(page: Page) {
  await page.route("**/api/client-errors", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, recorded: false, safeE2e: true }),
    });
  });
}

async function continueTo(page: Page, label: RegExp) {
  await page.getByRole("button", { name: label }).click();
}

async function isVisible(locator: ReturnType<Page["getByRole"]>, timeout = 1_500) {
  return locator.isVisible({ timeout }).catch(() => false);
}

async function maybeApproveCreativeBriefGate(page: Page) {
  const creativeBriefHeading = page.getByRole("heading", { name: /Build the creative set before anything renders/i });
  if (!(await creativeBriefHeading.isVisible({ timeout: 2_000 }).catch(() => false))) {
    return;
  }

  await expect(page.getByText(/UGC video is optional and can be added later/i)).toBeVisible();
  for (let index = 0; index < 3; index += 1) {
    const continueButton = page.getByRole("button", { name: /^Continue$/i });
    if (!(await isVisible(continueButton))) {
      break;
    }
    await continueButton.click();
  }

  const creativeIntakeResponse = page.waitForResponse(
    (response) => response.url().includes("/creative-intake") && response.request().method() === "POST",
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: /Generate Creative Set/i }).click();
  const response = await creativeIntakeResponse;
  expect(response.ok(), `creative intake approval should return 2xx, got ${response.status()}`).toBeTruthy();
  await expect(page.getByText(/Creative brief approved|Paid rendering can continue/i).first()).toBeVisible({ timeout: 15_000 });
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
    await disableClientErrorTelemetryWrites(page);

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
      page.getByText(
        /Your session expired or could not be refreshed|Sign-in is temporarily unavailable|The sign-in experience hit an unexpected error|Retry the request/,
      ).first(),
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
    "Set SAFE_E2E_QA_AUTH=true, QA_AUTH_HARNESS_ENABLED=true, QA_EMAIL, Supabase service-role env, and QA_AUTH_PROOF_SECRET or INTERNAL_SYSTEM_JOBS_SECRET/CRON_SECRET to run the authenticated safe journey.",
  );

  test("onboarding, preview modes, paywall, dashboard, and launch gates work without real-world side effects", async ({ page }) => {
    test.setTimeout(180_000);

    await establishQaSession(page);
    await disableActivationTelemetryWrites(page);
    await disableClientErrorTelemetryWrites(page);

    await page.goto("/onboarding?new=1", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page.getByRole("heading", { name: /Step-by-step campaign builder/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose campaign type" })).toBeVisible();
    const preview = page.getByTestId("prepaywall-campaign-preview").first();
    await expect(preview.getByText("Campaign preview")).toBeVisible();
    await expect(preview.getByText("Ad preview")).toBeVisible();
    await expect(
      preview.getByText(/Meta instant form setup|canonical reference opt-in/i).first(),
    ).toBeVisible();
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
      await page.getByRole("button", { name: new RegExp(mode, "i") }).click();
      await expect(
        page.getByRole("button", { name: new RegExp(`${mode}[\\s\\S]*Selected`, "i") }),
      ).toBeVisible();
      await expect(preview.getByText(/Campaign preview/i)).toBeVisible();
      await expect(preview.getByText(/Sample CTA:/i)).toBeVisible();
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
    await continueTo(page, /Continue to audience/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("We chose this because", { exact: false })).toBeVisible();
    await page.getByLabel("Recommended audience").fill("QA commercial prospects comparing launch-safe DealFlow previews");
    await expect(page.getByLabel("Custom price range or deal size")).toBeVisible();
    await continueTo(page, /Continue to budget/i);
    await expect(page.getByText("Recommended starting budget: $30-$50/day")).toBeVisible();
    await expect(page.getByRole("button", { name: /\$10\/day/i })).toBeVisible();
    await page.getByRole("button", { name: /\$50\/day/i }).click();
    await expect(page.getByText("Recommended: Quality leads")).toBeVisible();
    await expect(page.getByRole("button", { name: /Volume leads[\s\S]*Instant lead form/i })).toBeVisible();
    await continueTo(page, /Continue to setup/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("Language", { exact: true })).toBeVisible();
    await expect(page.getByText("Funnel branding", { exact: true })).toBeVisible();
    await continueTo(page, /Continue to offer/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("button", { name: "Available spaces shortlist", exact: true })).toBeVisible();
    await expect(page.getByText("Offer coach")).toHaveCount(0);
    await page.getByLabel("Offer or lead magnet").fill("Home Options for 600+ Credit");
    await continueTo(page, /Continue to agent/i);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByLabel("Agent first name")).toBeVisible();
    await expect(page.getByLabel("Company or brokerage")).toBeVisible();

    await page.getByLabel("Agent first name").fill("Safe");
    await page.getByLabel("Agent last name").fill("Browser");
    await page.getByLabel("Company or brokerage").fill("DealFlow QA Realty");
    await page.getByLabel("SMS alert phone").fill("555-010-2000");
    const continueToPlan = page.getByRole("button", { name: /Continue to plan/i });
    if (await isVisible(continueToPlan)) {
      await continueToPlan.click();
      await expectNoHorizontalOverflow(page);
      const proPlan = page.getByRole("button", { name: /Get started now|Pro.*\$297|Operator launch/i });
      if (await isVisible(proPlan)) {
        await proPlan.click();
      }
    }
    const continueToReview = page.getByRole("button", { name: /Continue to review/i });
    if (await isVisible(continueToReview)) {
      await continueTo(page, /Continue to review/i);
    }
    await expectNoHorizontalOverflow(page);

    await expect(page.getByText("Ready to build campaign preview")).toBeVisible();
    await expect(page.getByText("Launch readiness summary")).toBeVisible();
    await expect(page.getByText("Full-resolution files locked")).toBeVisible();
    await expect(page.getByText("No live ad, payment, message, or media action runs here.")).toBeVisible();
    let campaignId = new URL(page.url()).searchParams.get("campaignId") ?? "";
    if (!page.url().includes("/build/creatives")) {
      const onboardingPlanResponse = page.waitForResponse(
        (response) => response.url().includes("/api/onboarding/plan") && response.request().method() === "POST",
        { timeout: 90_000 },
      );
      await continueTo(page, /Continue to checkout|Continue to creatives|Continue/i);
      const response = await onboardingPlanResponse;
      const responseBody = await response.text();
      let onboardingPlanPayload: { success?: boolean; campaignId?: string; data?: { campaignId?: string }; error?: string } = {};
      try {
        onboardingPlanPayload = JSON.parse(responseBody) as typeof onboardingPlanPayload;
      } catch {
        onboardingPlanPayload = { error: responseBody.slice(0, 240) };
      }
      expect(
        response.ok(),
        `onboarding plan save should return 2xx, got ${response.status()} error=${onboardingPlanPayload.error ?? "none"}`,
      ).toBeTruthy();
      campaignId = onboardingPlanPayload.campaignId ?? onboardingPlanPayload.data?.campaignId ?? "";
      expect(campaignId, "onboarding plan save should return a campaign id").toBeTruthy();
      await expect(page).toHaveURL(new RegExp(`/(paywall|build/creatives)\\?campaignId=${campaignId}`), { timeout: 60_000 });
    }
    await maybeApproveCreativeBriefGate(page);
    campaignId = campaignId || new URL(page.url()).searchParams.get("campaignId") || "";
    expect(campaignId, "creative handoff should preserve a campaign id").toBeTruthy();
    await expectNoHorizontalOverflow(page);
    if (!page.url().includes("/paywall")) {
      await page.goto(`/paywall?campaignId=${encodeURIComponent(campaignId ?? "")}&plan=pro`);
      await expectNoHorizontalOverflow(page);
    }
    await expect(page.getByText("Pro · $297/mo")).toBeVisible();
    await expect(page.getByText(/Selected plan/i).first()).toBeVisible();

    await page.goto("/paywall?plan=pro");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("Campaign context needed")).toBeVisible();
    await expect(page.getByRole("button", { name: /Build preview first/i })).toBeDisabled();

    await page.goto("/dashboard");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText(/Dashboard|campaign/i).first()).toBeVisible();
    await expect(page.getByText("Layout behavior comparison")).toHaveCount(0);

    await page.goto("/launch");
    await expectNoHorizontalOverflow(page);
    await expect(
      page.getByText(/Campaign plan not found|Final review before launch|Activate billing before launch|Selected creative required|Saved creative set missing/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Connect Meta|Meta connection required|Build a campaign before moving into launch|Choose an ad in creatives|Open Creative Studio|Choose the creative test set first/i).first(),
    ).toBeVisible();

    await expect(page.getByRole("link", { name: /Ready to attempt launch/i })).toHaveCount(0);
  });
});
