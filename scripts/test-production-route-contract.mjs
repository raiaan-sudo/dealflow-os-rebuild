#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const runLive = args.has("--live");

let failures = 0;

function pass(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failures += 1;
  console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
}

function relativePath(...parts) {
  return path.join(root, ...parts);
}

function fileText(relativeFile) {
  return fs.readFileSync(relativePath(relativeFile), "utf8");
}

function exists(relativeFile) {
  return fs.existsSync(relativePath(relativeFile));
}

function assertExists(relativeFile, name) {
  if (exists(relativeFile)) {
    pass(name, relativeFile);
  } else {
    fail(name, `${relativeFile} is missing`);
  }
}

function assertMissing(relativeFile, name) {
  if (!exists(relativeFile)) {
    pass(name, `${relativeFile} is absent`);
  } else {
    fail(name, `${relativeFile} must not exist in production source`);
  }
}

function assertEmptyOrMissingDirectory(relativeDirectory, name) {
  if (!exists(relativeDirectory)) {
    pass(name, `${relativeDirectory} is absent`);
    return;
  }

  const entries = fs.readdirSync(relativePath(relativeDirectory)).filter((entry) => !entry.startsWith("."));

  if (entries.length === 0) {
    pass(name, `${relativeDirectory} is empty`);
  } else {
    fail(name, `${relativeDirectory} still contains: ${entries.join(", ")}`);
  }
}

function assertIncludes(relativeFile, pattern, name) {
  const text = fileText(relativeFile);
  const ok = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);

  if (ok) {
    pass(name, relativeFile);
  } else {
    fail(name, `${relativeFile} missing ${String(pattern)}`);
  }
}

function assertExcludes(relativeFile, pattern, name) {
  const text = fileText(relativeFile);
  const bad = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);

  if (bad) {
    fail(name, `${relativeFile} contains forbidden ${String(pattern)}`);
  } else {
    pass(name, relativeFile);
  }
}

function walkFiles(relativeDirectory) {
  const start = relativePath(relativeDirectory);
  if (!fs.existsSync(start)) {
    return [];
  }

  const output = [];
  const stack = [start];

  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.statSync(current);

    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        if (entry === "node_modules" || entry === ".next" || entry === ".git") {
          continue;
        }

        stack.push(path.join(current, entry));
      }
      continue;
    }

    if (/\.(ts|tsx|js|jsx|mjs|md)$/.test(current)) {
      output.push(path.relative(root, current));
    }
  }

  return output.sort();
}

function assertNoSourceMatches(pattern, name, options = {}) {
  const files = walkFiles(options.scope ?? "src");
  const offenders = [];

  for (const file of files) {
    if (options.exclude?.some((excluded) => file.includes(excluded))) {
      continue;
    }

    if (pattern.test(fileText(file))) {
      offenders.push(file);
    }
  }

  if (offenders.length === 0) {
    pass(name);
  } else {
    fail(name, offenders.join(", "));
  }
}

function assertPackageScript(scriptName) {
  const pkg = JSON.parse(fileText("package.json"));

  if (pkg.scripts?.[scriptName]) {
    pass("Package script registered", scriptName);
  } else {
    fail("Package script registered", `${scriptName} missing`);
  }
}

async function assertLiveRoute({ url, expectedStatus, expectedLocation, forbiddenText = [] }) {
  const response = await fetch(url, { redirect: "manual" });
  const text = await response.text().catch(() => "");
  const location = response.headers.get("location");

  if (response.status === expectedStatus) {
    pass("Live route status", `${url} -> ${response.status}`);
  } else {
    fail("Live route status", `${url} expected ${expectedStatus}, got ${response.status}`);
  }

  if (expectedLocation === undefined || location === expectedLocation) {
    pass("Live route location", `${url} -> ${location ?? "none"}`);
  } else {
    fail("Live route location", `${url} expected ${expectedLocation}, got ${location}`);
  }

  for (const forbidden of forbiddenText) {
    if (text.includes(forbidden)) {
      fail("Live forbidden text", `${url} contains ${forbidden}`);
    } else {
      pass("Live forbidden text", `${url} excludes ${forbidden}`);
    }
  }
}

async function runStaticContract() {
  console.log("INFO  Checking production route/source contract");

  assertExists("docs/contracts/production-route-contract.md", "Production route contract doc");

  assertMissing("src/components/campaign/campaign-builder-workspace.tsx", "Legacy builder workspace removed");
  assertEmptyOrMissingDirectory("src/components/campaign/builder", "Legacy builder component directory removed");
  assertMissing("src/app/api/builder/command/route.ts", "Legacy builder command API removed");
  assertMissing("src/app/api/builder/copy-assistant/route.ts", "Legacy builder copy assistant API removed");
  assertMissing("src/app/api/builder/section-assistant/route.ts", "Legacy builder section assistant API removed");

  assertIncludes("src/app/(app)/builder/page.tsx", "redirectUrl = new URL(\"/onboarding\"", "Builder route redirects to onboarding");
  assertExcludes("src/app/(app)/builder/page.tsx", "CampaignBuilderWorkspace", "Builder route cannot import legacy workspace");
  assertIncludes("src/app/(app)/layout.tsx", "pathname.startsWith(\"/onboarding\")", "Onboarding uses focused product layout");
  assertIncludes("src/app/(app)/onboarding/page.tsx", 't(`onboarding.title.${currentStep}`', "Verified onboarding review step uses the locale catalog");
  assertIncludes("src/app/(app)/onboarding/page.tsx", 't("onboarding.ready")', "Verified onboarding build preview uses the locale catalog");
  assertIncludes("src/app/(app)/onboarding/page.tsx", 't("onboarding.activatePro")', "Verified onboarding paywall CTA uses the locale catalog");
  assertIncludes("src/components/onboarding/prepaywall-campaign-preview.tsx", "uiCopy.packageTitle", "Verified campaign package preview uses localized copy");
  assertIncludes("src/lib/i18n/messages.ts", '"onboarding.title.review": "Confirm and build"', "English review-step catalog value is preserved");
  assertIncludes("src/lib/i18n/messages.ts", '"onboarding.ready": "Ready to build campaign preview"', "English build-preview catalog value is preserved");
  assertIncludes("src/lib/i18n/messages.ts", '"onboarding.activatePro": "Activate Pro"', "English activation catalog value is preserved");
  assertIncludes("src/lib/i18n/prepaywall-preview-copy.ts", 'packageTitle: "Campaign package preview"', "English package-preview catalog value is preserved");
  assertIncludes("src/lib/billing/plan-presentation.ts", "Only launch plan", "Verified launch plan presentation is present");
  assertExcludes("src/app/(app)/onboarding/page.tsx", "STEP 1 OF 7: WORKSPACE", "Old linear onboarding shell is absent");
  assertExcludes("src/components/layout/sidebar.tsx", "href: \"/builder\"", "Sidebar does not link to builder");
  assertExcludes("src/components/layout/top-bar.tsx", "href: \"/builder\"", "Mobile nav does not link to builder");
  assertExcludes("src/app/(app)/dashboard/page.tsx", "/builder", "Dashboard does not link to builder");
  assertExcludes("src/app/(app)/preview/page.tsx", "/builder", "Preview does not link to builder");
  assertExcludes("src/lib/navigation.ts", "href: \"/builder\"", "Shared navigation does not link to builder");

  assertIncludes("src/proxy.ts", "ROOT_APP_REDIRECT_HOSTS", "Root app redirect host contract is centralized");
  assertIncludes("src/proxy.ts", "\"agentdealflow.io\"", "AgentDealFlow root is treated as app domain");
  assertIncludes("src/proxy.ts", "loadVerifiedPartnerDomainContext(request.nextUrl.hostname)", "Partner root routing uses the verified domain resolver");
  assertIncludes("src/proxy.ts", "verifiedPartnerDomain === host", "Every verified partner root is treated as an app domain");
  assertExcludes("src/proxy.ts", "\"clicktoscale.io\"", "ClickToScale is not hardcoded into app routing");
  assertIncludes("src/lib/white-label/verified-partner-domain.ts", 'readRows("partner_domains"', "Partner routing resolves from partner-domain records");
  assertIncludes("src/lib/white-label/verified-partner-domain.ts", 'verification_status: "eq.verified"', "Partner routing requires verified domain status");
  assertIncludes("src/lib/white-label/verified-partner-domain.ts", 'ssl_status: "eq.active"', "Partner routing requires active SSL status");
  assertIncludes("src/lib/white-label/verified-partner-domain.ts", "domainRows.length !== 1", "Partner routing rejects missing or ambiguous domain records");
  assertIncludes("src/proxy.ts", "pathname.startsWith(\"/f/\")", "Public funnel route remains public");
  assertIncludes("src/proxy.ts", "pathname === \"/ui-direction\"", "UI direction preview is explicitly gated");

  assertNoSourceMatches(/CampaignBuilderWorkspace/, "Legacy builder workspace symbol absent from src");
  assertNoSourceMatches(/Guided setup stays on by default/, "Legacy builder copy absent from src");
  assertNoSourceMatches(/\/api\/builder\/(command|copy-assistant|section-assistant)/, "Legacy builder API calls absent from src");

  assertPackageScript("test:production-route-contract");
}

async function runLiveContract() {
  console.log("INFO  Checking live production route contract");

  await assertLiveRoute({
    url: "https://clicktoscale.io/",
    expectedStatus: 307,
    expectedLocation: "/onboarding",
  });
  await assertLiveRoute({
    url: "https://agentdealflow.io/",
    expectedStatus: 307,
    expectedLocation: "/onboarding",
  });
  await assertLiveRoute({
    url: "https://clicktoscale.io/builder",
    expectedStatus: 307,
    expectedLocation: "/login?reason=expired&redirectedFrom=%2Fbuilder",
    forbiddenText: ["Guided setup stays on by default"],
  });
  await assertLiveRoute({
    url: "https://clicktoscale.io/f/hamza-juma",
    expectedStatus: 200,
    expectedLocation: null,
    forbiddenText: ["Guided setup stays on by default", "CampaignBuilderWorkspace"],
  });
}

await runStaticContract();

if (runLive) {
  await runLiveContract();
}

if (failures > 0) {
  console.error(`FAIL  Production route contract failed with ${failures} issue${failures === 1 ? "" : "s"}`);
  process.exit(1);
}

console.log("PASS  Production route contract passed");
