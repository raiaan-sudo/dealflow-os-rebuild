#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import { chromium, devices } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const DEFAULT_OUT_DIR = path.join(
  process.cwd(),
  "docs",
  "launch-reports",
  `live-auth-browser-qa-${new Date().toISOString().slice(0, 10)}`,
);

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...parts] = arg.slice(2).split("=");
      return [key, parts.length > 0 ? parts.join("=") : "true"];
    }),
);

const mode = args.get("mode") === "admin" ? "admin" : "normal";
const appUrl = (args.get("base-url") ?? process.env.APP_URL ?? "https://app.agentdealflow.io").replace(/\/$/, "");
const outDir = path.resolve(args.get("out") ?? DEFAULT_OUT_DIR);
const userEmail = (args.get("email") ?? process.env.QA_EMAIL ?? "").trim().toLowerCase();
const targetCampaignId =
  args.get("target-campaign-id") ?? process.env.QA_CROSS_TENANT_CAMPAIGN_ID ?? "957014e8-870f-40e1-9f71-ea7256b09482";
const targetWorkspaceId =
  args.get("target-workspace-id") ?? process.env.QA_CROSS_TENANT_WORKSPACE_ID ?? "42e2ccc8-8515-48c3-b105-df531f82031d";
const targetAssetId = args.get("target-asset-id") ?? process.env.QA_CROSS_TENANT_ASSET_ID ?? "";
const allowAdminProof = args.get("confirm-admin-proof") === "TEMP_ADMIN_ENV_WINDOW";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function redactEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) return "[redacted]";
  return `${name.slice(0, 2)}***@${domain}`;
}

function classifyConsole(msg) {
  const text = msg.text();
  if (/Content Security Policy.*Report Only|report-uri|CSP/i.test(text)) return "csp_report_only";
  if (/turnstile|cloudflare|No available adapters/i.test(text)) return "turnstile_third_party";
  if (/WebGL|GPU|software rendering|ANGLE/i.test(text)) return "browser_gpu_noise";
  if (/capig\.datah04\.com|ERR_BLOCKED_BY_CLIENT|pixel/i.test(text)) return "third_party_tracking";
  return "unclassified";
}

function classifyFailedRequest(request) {
  const failure = request.failure()?.errorText ?? "";
  const url = request.url();
  if (failure.includes("ERR_ABORTED") && (url.includes("_rsc=") || url.includes("/_next/"))) {
    return "next_navigation_abort";
  }
  if (/capig\.datah04\.com|facebook\.com|connect\.facebook\.net/i.test(url)) return "third_party_tracking";
  return "unclassified";
}

function classifyHttpErrorResponse(response) {
  const url = response.url();
  const status = response.status();
  if (status < 400) return "ok";
  if (/capig\.datah04\.com|facebook\.com|connect\.facebook\.net/i.test(url)) return "third_party_tracking";
  if (/challenges\.cloudflare\.com|turnstile/i.test(url)) return "turnstile_third_party";
  if (status === 404 && /\/favicon\.ico(?:$|\?)/i.test(url)) return "browser_icon_optional";
  if (status === 404 && (url.includes("_rsc=") || url.includes("/_next/"))) return "next_navigation_prefetch";
  return "unclassified";
}

async function createCookieState() {
  if (!userEmail) throw new Error("QA_EMAIL or --email is required.");

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userEmail,
  });
  if (linkError) throw linkError;
  const tokenHash = linkData.properties?.hashed_token;
  if (!tokenHash) throw new Error("Supabase generated link without hashed token.");

  const { data: sessionData, error: verifyError } = await anon.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (verifyError) throw verifyError;
  const session = sessionData.session;
  if (!session?.access_token || !session.refresh_token) throw new Error("Supabase session is missing tokens.");

  const cookieMap = new Map();
  const ssr = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      get: (name) => cookieMap.get(name),
      set: (name, value) => cookieMap.set(name, value),
      remove: (name) => cookieMap.delete(name),
    },
  });
  const { error } = await ssr.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;

  return Array.from(cookieMap, ([name, value]) => ({
    name,
    value,
    domain: ".agentdealflow.io",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  }));
}

function assertModeSafety() {
  if (mode === "admin" && !allowAdminProof) {
    throw new Error(
      "Admin mode requires --confirm-admin-proof=TEMP_ADMIN_ENV_WINDOW and a separately controlled temporary admin env window.",
    );
  }
}

async function prepareContext(browser, cookies, kind) {
  const opts =
    kind === "mobile"
      ? { ...devices["iPhone 13"], baseURL: appUrl }
      : { viewport: { width: 1440, height: 1200 }, baseURL: appUrl };
  const context = await browser.newContext(opts);
  await context.addCookies(cookies);
  await context.route("**/api/client-errors", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, recorded: false, proof: "live-auth-browser-qa" }),
    }),
  );
  await context.route("**/api/activation/events", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, recorded: false, proof: "live-auth-browser-qa" }),
    }),
  );
  return context;
}

async function checkOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function visitRoute(context, results, kind, route, expectedText = []) {
  const page = await context.newPage();
  page.on("console", (msg) => {
    results.consoleEvents.push({
      kind,
      route,
      type: msg.type(),
      class: classifyConsole(msg),
      text: msg.text().slice(0, 500),
    });
  });
  page.on("requestfailed", (request) => {
    results.failedRequests.push({
      kind,
      route,
      source: "requestfailed",
      class: classifyFailedRequest(request),
      url: request.url(),
      failure: request.failure()?.errorText ?? null,
    });
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    results.failedRequests.push({
      kind,
      route,
      source: "response",
      class: classifyHttpErrorResponse(response),
      url: response.url(),
      status,
      statusText: response.statusText(),
    });
  });

  const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((error) => ({
    status: () => 0,
    error: error instanceof Error ? error.message : String(error),
  }));
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  await page.waitForTimeout(1_800);

  const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  const safeSlug = `${mode}-${kind}-${route}`
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  const screenshot = path.join(outDir, `${safeSlug || "root"}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });

  const overflow = await checkOverflow(page);
  const adminBlocked =
    route.startsWith("/admin/") && mode === "normal"
      ? /404|not found|could not be found/i.test(bodyText) || response?.status?.() === 404
      : null;

  results.routes.push({
    kind,
    route,
    status: response?.status?.() ?? null,
    finalUrl: page.url(),
    screenshot,
    expectedText: expectedText.map((text) => ({
      text: String(text),
      found: bodyText.includes(text) || new RegExp(text, "i").test(bodyText),
    })),
    adminBlocked,
    overflow,
    bodySample: bodyText.slice(0, 300),
  });

  await page.close();
}

async function apiProbe(context, results, method, url, expectedStatuses) {
  const response = await context.request.fetch(url, { method });
  const body = await response.text().catch(() => "");
  results.apiProbes.push({
    method,
    url,
    status: response.status(),
    expected: expectedStatuses,
    ok: expectedStatuses.includes(response.status()),
    bodySample: body.slice(0, 260),
  });
}

async function run() {
  assertModeSafety();
  fs.mkdirSync(outDir, { recursive: true });

  const cookies = await createCookieState();
  const browser = await chromium.launch({ headless: true });
  const contexts = [];
  const results = {
    mode,
    appUrl,
    user: redactEmail(userEmail),
    startedAt: new Date().toISOString(),
    routes: [],
    apiProbes: [],
    consoleEvents: [],
    failedRequests: [],
    assertions: [],
  };

  try {
    const desktop = await prepareContext(browser, cookies, "desktop");
    const mobile = await prepareContext(browser, cookies, "mobile");
    contexts.push(desktop, mobile);

    if (mode === "normal") {
      for (const [kind, context] of [
        ["desktop", desktop],
        ["mobile", mobile],
      ]) {
        await visitRoute(context, results, kind, "/dashboard", ["Dashboard"]);
        await visitRoute(context, results, kind, "/onboarding", ["Step-by-step campaign builder"]);
        await visitRoute(context, results, kind, "/builder", ["Active campaign workspace"]);
        await visitRoute(context, results, kind, "/build/creatives", ["Active campaign workspace"]);
        await visitRoute(context, results, kind, "/launch", ["Launch"]);
        await visitRoute(context, results, kind, "/settings", ["Settings"]);
        await visitRoute(context, results, kind, "/admin/partners");
        await visitRoute(context, results, kind, "/admin/control-room");
        await visitRoute(context, results, kind, "/admin/command-center");
        await visitRoute(context, results, kind, "/admin/launch-monitor");
      }

      const page = await desktop.newPage();
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
      const text = await page.locator("body").innerText().catch(() => "");
      results.assertions.push({ name: "normal_no_partners_tab", pass: !/(^|\n)Partners(\n|$)/i.test(text) });
      results.assertions.push({
        name: "normal_no_admin_workspace_lookup",
        pass: !/workspaceLookup|Search all workspaces|Admin workspace/i.test(text),
      });
      await page.close();

      await apiProbe(desktop, results, "GET", `/api/campaigns/${targetCampaignId}`, [401, 403, 404]);
      if (targetAssetId) {
        await apiProbe(desktop, results, "GET", `/api/assets/${targetAssetId}`, [401, 403, 404]);
      } else {
        await apiProbe(desktop, results, "GET", "/api/assets/00000000-0000-4000-8000-000000000000", [401, 403, 404]);
      }
      await apiProbe(desktop, results, "GET", `/api/dashboard?workspaceId=${targetWorkspaceId}`, [200, 401, 403, 404]);
    } else {
      for (const [kind, context] of [
        ["desktop", desktop],
        ["mobile", mobile],
      ]) {
        await visitRoute(context, results, kind, "/dashboard", ["Dashboard"]);
        await visitRoute(context, results, kind, "/admin/partners", ["Partners"]);
        await visitRoute(context, results, kind, "/admin/control-room", ["Control"]);
        await visitRoute(context, results, kind, "/admin/command-center", ["Command"]);
        await visitRoute(context, results, kind, "/admin/launch-monitor", ["Launch"]);
        await visitRoute(context, results, kind, "/admin/fulfillment-monitor", ["Fulfillment"]);
        await visitRoute(context, results, kind, "/admin/incidents", ["Incident"]);
        await visitRoute(context, results, kind, "/admin/issues", ["Issue"]);
        await visitRoute(context, results, kind, "/onboarding", ["Step-by-step campaign builder"]);
        await visitRoute(context, results, kind, "/build/creatives", ["Creative|Active campaign workspace"]);
        await visitRoute(context, results, kind, "/launch", ["Launch"]);
        await visitRoute(context, results, kind, "/settings", ["Settings"]);
      }

      const page = await desktop.newPage();
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
      const text = await page.locator("body").innerText().catch(() => "");
      results.assertions.push({ name: "admin_partners_visible", pass: /Partners/i.test(text) });
      results.assertions.push({ name: "admin_workspace_switcher_or_workspace_visible", pass: /Workspace|workspace/i.test(text) });
      await page.close();
    }
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  results.finishedAt = new Date().toISOString();
  for (const event of results.consoleEvents) {
    if (
      event.class === "unclassified" &&
      /Failed to load resource: the server responded with a status of \d+/i.test(event.text)
    ) {
      const hasMatchingHttpFailure = results.failedRequests.some(
        (request) => request.kind === event.kind && request.route === event.route && request.source === "response",
      );
      if (hasMatchingHttpFailure) event.class = "http_error_already_captured";
    }
  }
  results.unclassifiedConsoleCount = results.consoleEvents.filter(
    (event) => event.class === "unclassified" && ["error", "warning"].includes(event.type),
  ).length;
  results.failedRequestCount = results.failedRequests.length;
  results.unclassifiedFailedRequestCount = results.failedRequests.filter((event) => event.class === "unclassified").length;
  results.overflowCount = results.routes.filter((route) => route.overflow).length;
  const adminRoutePass =
    mode === "normal" ? results.routes.filter((route) => route.route.startsWith("/admin/")).every((route) => route.adminBlocked) : true;
  results.pass =
    results.routes.every((route) => route.expectedText.every((expectation) => expectation.found)) &&
    adminRoutePass &&
    results.apiProbes.every((probe) => probe.ok) &&
    results.assertions.every((assertion) => assertion.pass) &&
    results.unclassifiedConsoleCount === 0 &&
    results.unclassifiedFailedRequestCount === 0 &&
    results.overflowCount === 0;

  const summaryPath = path.join(outDir, `${mode}-summary.json`);
  fs.writeFileSync(summaryPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        mode,
        pass: results.pass,
        outDir,
        summaryPath,
        routeCount: results.routes.length,
        apiProbeCount: results.apiProbes.length,
        unclassifiedConsoleCount: results.unclassifiedConsoleCount,
        failedRequestCount: results.failedRequestCount,
        unclassifiedFailedRequestCount: results.unclassifiedFailedRequestCount,
        overflowCount: results.overflowCount,
        assertions: results.assertions,
      },
      null,
      2,
    ),
  );
  if (!results.pass) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
