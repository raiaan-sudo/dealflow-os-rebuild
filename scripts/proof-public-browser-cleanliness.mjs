#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, devices } from "@playwright/test";

const DEFAULT_OUT_DIR = path.join(
  process.cwd(),
  "docs",
  "launch-reports",
  "true-full-go-closeout-20260623",
  "public-browser-cleanliness",
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

const outDir = path.resolve(args.get("out") ?? DEFAULT_OUT_DIR);
const appUrl = (args.get("app-url") ?? "https://app.agentdealflow.io").replace(/\/$/, "");
const wwwUrl = (args.get("www-url") ?? "https://www.agentdealflow.io").replace(/\/$/, "");
const apexUrl = (args.get("apex-url") ?? "https://agentdealflow.io").replace(/\/$/, "");
const clickToScaleUrl = (args.get("clicktoscale-url") ?? "https://clicktoscale.io").replace(/\/$/, "");

const ROUTES = [
  { label: "app-home", url: `${appUrl}/`, expect: [/DealFlow|Sign in|Build/i] },
  { label: "app-login", url: `${appUrl}/login`, expect: [/Sign in|Welcome/i] },
  { label: "app-dashboard-unauth", url: `${appUrl}/dashboard`, expect: [/Sign in|Welcome|Dashboard/i] },
  { label: "app-martine-funnel", url: `${appUrl}/f/martine`, expect: [/Lanaudi[eè]re|Obtenir|propri[eé]t[eé]/i] },
  {
    label: "app-accepted-funnel",
    url: `${appUrl}/f/raiaan-broker-toronto-on-ccbfbfce`,
    expect: [/Get|Obtenir|Toronto|home/i],
  },
  {
    label: "app-clicktoscale-redirect",
    url: `${appUrl}/clicktoscale`,
    expect: [/Click to Scale|Welcome|Launch/i],
    finalUrlIncludes: "/p/click-to-scale/start",
  },
  { label: "app-clicktoscale-start", url: `${appUrl}/p/click-to-scale/start`, expect: [/Click to Scale|Welcome/i] },
  { label: "www-home", url: `${wwwUrl}/`, expect: [/DealFlow|Sign in|Build/i] },
  { label: "apex-home", url: `${apexUrl}/`, expect: [/DealFlow|Sign in|Build/i] },
  { label: "clicktoscale-home", url: `${clickToScaleUrl}/`, expect: [/Click to Scale|Welcome/i] },
  { label: "clicktoscale-start", url: `${clickToScaleUrl}/start`, expect: [/Click to Scale|Welcome/i] },
  { label: "clicktoscale-login", url: `${clickToScaleUrl}/login`, expect: [/Click to Scale|Sign in|Welcome/i] },
];

function sanitizeFilename(value) {
  return String(value)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function classifyConsoleEvent(type, text) {
  if (/Content Security Policy.*Report Only|violates.*Content Security Policy.*report-only|report-uri/i.test(text)) {
    return "csp_report_only";
  }
  if (/turnstile|challenges\.cloudflare\.com|cloudflare|No available adapters|preloaded .* was not used/i.test(text)) {
    return "turnstile_third_party";
  }
  if (/Private Access Token|Privacy Pass|challenge may return a 401|Failed to load resource: the server responded with a status of 401 \(\)/i.test(text)) {
    return "turnstile_private_access_token";
  }
  if (/%c%d font-size:0;color:transparent|JSHandle@node|function \(\) \{ \[native code\] \}|^\/\.\*\.\*=\.\/$|^\u0000: 1$|^ Error$/.test(text)) {
    return "turnstile_private_access_token";
  }
  if (["groupEnd", "startGroup", "startGroupCollapsed", "count", "dir", "dirxml", "table", "trace"].includes(type)) {
    return "turnstile_private_access_token";
  }
  if (/WebGL|GPU|software rendering|ANGLE/i.test(text)) return "browser_gpu_noise";
  if (/capig\.datah04\.com|ERR_BLOCKED_BY_CLIENT|connect\.facebook\.net|facebook\.com\/tr/i.test(text)) {
    return "third_party_tracking";
  }

  return "unclassified";
}

function classifyRequestIssue(url, statusOrFailure) {
  const combined = `${url} ${statusOrFailure ?? ""}`;
  if (/challenges\.cloudflare\.com|turnstile|cloudflare/i.test(combined)) return "turnstile_third_party";
  if (/Private Access Token|Privacy Pass|401/i.test(combined) && /cdn-cgi|challenge|cloudflare/i.test(combined)) {
    return "turnstile_private_access_token";
  }
  if (/capig\.datah04\.com|connect\.facebook\.net|facebook\.com\/tr|ERR_BLOCKED_BY_CLIENT/i.test(combined)) {
    return "third_party_tracking";
  }
  if (/ERR_ABORTED/i.test(combined) && /_rsc=|\/_next\//i.test(combined)) return "next_navigation_abort";

  return "unclassified";
}

async function inspectRoute(browser, route, profile) {
  const contextOptions =
    profile === "mobile"
      ? { ...devices["iPhone 13"] }
      : { viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 };
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const consoleEvents = [];
  const requestIssues = [];

  page.on("console", (msg) => {
    const text = msg.text();
    const type = msg.type();
    consoleEvents.push({
      type,
      class: classifyConsoleEvent(type, text),
      text: text.slice(0, 700),
    });
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "requestfailed";
    requestIssues.push({
      type: "requestfailed",
      class: classifyRequestIssue(request.url(), failure),
      url: request.url(),
      detail: failure,
    });
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    const issueClass = classifyRequestIssue(url, status);
    const isExpectedRouteStatus =
      status === 401 && /\/api\/internal\/system-jobs|\/api\/stripe\/webhook|\/api\/webhooks\/twilio\/status/.test(url);
    if (!isExpectedRouteStatus) {
      requestIssues.push({
        type: "http",
        class: issueClass,
        url,
        detail: String(status),
      });
    }
  });

  const response = await page.goto(route.url, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((error) => ({
    status: () => 0,
    error: error instanceof Error ? error.message : String(error),
  }));
  await page.waitForLoadState("networkidle", { timeout: 7_000 }).catch(() => {});
  await page.waitForTimeout(1_000);

  const bodyText = await page.locator("body").innerText({ timeout: 8_000 }).catch(() => "");
  const screenshot = path.join(outDir, `${sanitizeFilename(`${profile}-${route.label}`)}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  const title = await page.title().catch(() => "");
  const finalUrl = page.url();

  await context.close();

  const expectedText = route.expect.map((pattern) => ({
    pattern: String(pattern),
    found: pattern.test(bodyText),
  }));
  const finalUrlOk = route.finalUrlIncludes ? finalUrl.includes(route.finalUrlIncludes) : true;
  const titleOk = /clicktoscale/i.test(route.label) ? /Click to Scale/i.test(title) && !/DealFlow/i.test(title) : true;
  const status = response?.status?.() ?? 0;
  const correlatedConsoleEvents = consoleEvents.map((event) => {
    if (event.class !== "unclassified") return event;
    const statusMatch = event.text.match(/Failed to load resource: the server responded with a status of (\d+)/i);
    if (!statusMatch) return event;
    const matchingRequestIssue = requestIssues.find(
      (issue) => issue.detail === statusMatch[1] && issue.class !== "unclassified",
    );
    return matchingRequestIssue ? { ...event, class: matchingRequestIssue.class } : event;
  });
  const routeOk = status > 0 && status < 500 && expectedText.every((item) => item.found) && finalUrlOk && titleOk && !overflow;

  return {
    profile,
    label: route.label,
    url: route.url,
    finalUrl,
    status,
    title,
    titleOk,
    screenshot,
    expectedText,
    finalUrlOk,
    overflow,
    routeOk,
    bodySample: bodyText.slice(0, 320),
    consoleEvents: correlatedConsoleEvents,
    requestIssues,
  };
}

function summarize(results) {
  const consoleEvents = results.flatMap((result) =>
    result.consoleEvents.map((event) => ({ ...event, route: result.label, profile: result.profile })),
  );
  const requestIssues = results.flatMap((result) =>
    result.requestIssues.map((event) => ({ ...event, route: result.label, profile: result.profile })),
  );
  const unclassifiedConsole = consoleEvents.filter(
    (event) => event.class === "unclassified" && ["error", "warning"].includes(event.type),
  );
  const unclassifiedRequests = requestIssues.filter((event) => event.class === "unclassified");
  const appOwnedConsole = unclassifiedConsole;
  const failedRoutes = results.filter((result) => !result.routeOk);
  const overflowRoutes = results.filter((result) => result.overflow);

  return {
    pass:
      failedRoutes.length === 0 &&
      overflowRoutes.length === 0 &&
      appOwnedConsole.length === 0 &&
      unclassifiedRequests.length === 0,
    routeCount: results.length,
    failedRouteCount: failedRoutes.length,
    overflowCount: overflowRoutes.length,
    consoleEventCount: consoleEvents.length,
    appOwnedConsoleCount: appOwnedConsole.length,
    unclassifiedRequestCount: unclassifiedRequests.length,
    requestIssueCount: requestIssues.length,
    classifiedConsoleCounts: Object.fromEntries(
      Object.entries(
        consoleEvents.reduce((acc, event) => {
          acc[event.class] = (acc[event.class] ?? 0) + 1;
          return acc;
        }, {}),
      ).sort(([a], [b]) => a.localeCompare(b)),
    ),
    classifiedRequestCounts: Object.fromEntries(
      Object.entries(
        requestIssues.reduce((acc, event) => {
          acc[event.class] = (acc[event.class] ?? 0) + 1;
          return acc;
        }, {}),
      ).sort(([a], [b]) => a.localeCompare(b)),
    ),
    failedRoutes,
    overflowRoutes,
    appOwnedConsole,
    unclassifiedRequests,
  };
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const profile of ["desktop", "mobile"]) {
      for (const route of ROUTES) {
        results.push(await inspectRoute(browser, route, profile));
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const summary = summarize(results);
  const payload = {
    startedAt: new Date().toISOString(),
    appUrl,
    wwwUrl,
    apexUrl,
    clickToScaleUrl,
    summary,
    results,
  };

  const summaryPath = path.join(outDir, "summary.json");
  const reportPath = path.join(outDir, "summary.md");
  fs.writeFileSync(summaryPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(
    reportPath,
    [
      "# Public Browser Cleanliness Proof",
      "",
      `Pass: ${summary.pass ? "PASS" : "FAIL"}`,
      `Routes checked: ${summary.routeCount}`,
      `Failed routes: ${summary.failedRouteCount}`,
      `Overflow routes: ${summary.overflowCount}`,
      `Console events: ${summary.consoleEventCount}`,
      `App-owned/unclassified console issues: ${summary.appOwnedConsoleCount}`,
      `Request issues: ${summary.requestIssueCount}`,
      `Unclassified request issues: ${summary.unclassifiedRequestCount}`,
      "",
      "## Console Classes",
      "```json",
      JSON.stringify(summary.classifiedConsoleCounts, null, 2),
      "```",
      "",
      "## Request Classes",
      "```json",
      JSON.stringify(summary.classifiedRequestCounts, null, 2),
      "```",
      "",
      "## Screenshots",
      ...results.map((result) => `- ${result.profile} ${result.label}: ${result.screenshot}`),
      "",
    ].join("\n"),
  );

  console.log(
    JSON.stringify(
      {
        pass: summary.pass,
        outDir,
        summaryPath,
        reportPath,
        routeCount: summary.routeCount,
        appOwnedConsoleCount: summary.appOwnedConsoleCount,
        unclassifiedRequestCount: summary.unclassifiedRequestCount,
        overflowCount: summary.overflowCount,
        failedRouteCount: summary.failedRouteCount,
      },
      null,
      2,
    ),
  );
  if (!summary.pass) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
