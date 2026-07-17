#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const paths = {
  rootLayout: "src/app/layout.tsx",
  appLayout: "src/app/(app)/layout.tsx",
  loginPage: "src/app/(auth)/login/page.tsx",
  loginForm: "src/components/auth/login-form.tsx",
  safeRedirect: "src/lib/auth/safe-redirect.ts",
  authCallback: "src/app/auth/callback/route.ts",
  leadForm: "src/app/f/[slug]/lead-capture-form.tsx",
  feedbackWidget: "src/components/layout/feedback-widget.tsx",
  creativeWizard: "src/app/(app)/build/creatives/creative-wizard.tsx",
  homepage: "src/components/marketing/home-command-center.tsx",
  metaSelections: "src/components/campaign/launch/launch-meta-selection-panel.tsx",
  onboarding: "src/app/(app)/onboarding/page.tsx",
  results: "src/app/results/page.tsx",
  commandCenter: "src/app/(app)/admin/command-center/command-center-console.tsx",
  topBar: "src/components/layout/top-bar.tsx",
  localeLink: "src/components/i18n/locale-link.tsx",
  localeSwitcher: "src/components/i18n/locale-switcher.tsx",
  productMessages: "src/lib/i18n/messages.ts",
  globalStyles: "src/app/globals.css",
};

const sources = Object.fromEntries(
  Object.entries(paths).map(([name, file]) => [name, fs.readFileSync(file, "utf8")]),
);

function assertIncludes(sourceName, marker, message) {
  assert.ok(sources[sourceName].includes(marker), `${message}: ${paths[sourceName]} is missing ${marker}`);
}

function openingTagContaining(sourceName, tagName, marker) {
  const source = sources[sourceName];
  const markerIndex = source.indexOf(marker);
  assert.ok(markerIndex >= 0, `${paths[sourceName]} is missing ${marker}`);
  const tagStart = source.lastIndexOf(`<${tagName}`, markerIndex);
  const closingMarker = tagName === "input" ? "/>" : ">";
  const tagEnd = source.indexOf(closingMarker, markerIndex);
  assert.ok(tagStart >= 0 && tagEnd > markerIndex, `${paths[sourceName]} has no ${tagName} tag for ${marker}`);
  return source.slice(tagStart, tagEnd + closingMarker.length);
}

function findFunction(source, fileName, functionName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let match = null;

  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      match = node;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.ok(match, `${functionName} must exist in ${fileName}`);
  return { sourceFile, node: match };
}

function loadRedirectValidator() {
  const { sourceFile, node } = findFunction(
    sources.safeRedirect,
    paths.safeRedirect,
    "getSafeAuthRedirectPath",
  );
  const functionSource = node.getText(sourceFile).replace(/^export\s+/, "");
  const executable = ts.transpileModule(
    `const parseProductLocalePathname = (pathname) => ({ pathname });\n${functionSource}\nglobalThis.__redirectValidator = getSafeAuthRedirectPath;`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const sandbox = { URL };

  vm.runInNewContext(executable, sandbox);
  assert.equal(typeof sandbox.__redirectValidator, "function", "redirect validator must be executable");
  return sandbox.__redirectValidator;
}

const validateRedirect = loadRedirectValidator();
const origin = "https://app.agentdealflow.io";
const defaultPath = "/onboarding?fresh=1";
const redirectCases = [
  ["missing value", undefined, defaultPath],
  ["same-origin app path", "/dashboard?plan=pro#review", "/dashboard?plan=pro#review"],
  ["normalized same-origin path", "/admin/../dashboard", "/dashboard"],
  ["scheme-relative network path", "//evil.example/dashboard", defaultPath],
  ["slash-backslash network path", String.raw`/\evil.example/dashboard`, defaultPath],
  ["backslash inside path", String.raw`/dashboard\evil`, defaultPath],
  ["absolute external URL", "https://evil.example/dashboard", defaultPath],
  ["login loop", "/login?redirectedFrom=%2Fdashboard", defaultPath],
  ["root loop", "/", defaultPath],
];

for (const [name, value, expected] of redirectCases) {
  assert.equal(
    validateRedirect(value, origin, defaultPath),
    expected,
    `redirect case failed: ${name}`,
  );
}

assertIncludes(
  "loginForm",
  'import { getSafeAuthRedirectPath } from "@/lib/auth/safe-redirect";',
  "login must use the shared safe redirect contract",
);
assertIncludes(
  "loginForm",
  'href("/onboarding?fresh=1")',
  "login redirect fallback must use the locale-aware href helper",
);

assertIncludes(
  "results",
  '      : "/dashboard",',
  "results without an explicit demo plan must open the real campaign dashboard",
);
assertIncludes(
  "results",
  "campaignId=${encodeURIComponent(campaignId)}",
  "results must preserve an explicit campaign selection",
);

assertIncludes(
  "loginForm",
  'getAuthCallbackUrl("recovery", redirectedFrom)',
  "password recovery must use the server-side PKCE callback",
);
assertIncludes(
  "authCallback",
  "supabase.auth.exchangeCodeForSession(code)",
  "the PKCE callback must exchange the one-time code server-side",
);
assertIncludes(
  "authCallback",
  'mode: "update-password"',
  "a successful recovery exchange must enter update-password mode",
);
assert.doesNotMatch(
  sources.loginForm,
  /window\.location\.hash|auth\.setSession/,
  "recovery must not parse or persist bearer credentials from a browser fragment",
);

assertIncludes("rootLayout", 'default: "DealFlow OS — Build, launch, and optimize campaigns"', "root title fallback");
assertIncludes("loginPage", 'translateProductMessage(locale, "auth.signIn")', "localized login title wiring");
assertIncludes("productMessages", '"auth.signIn": "Sign in"', "canonical English login title");

assertIncludes("appLayout", 'className="df-skip-link"', "app skip link");
assertIncludes("appLayout", 'id="main-content"', "app skip target");
assertIncludes("homepage", 'className="df-skip-link"', "homepage skip link");
assertIncludes("homepage", 'href="#homepage-content"', "homepage skip link destination");
assertIncludes("homepage", 'id="homepage-content"', "homepage post-navigation skip target");
assertIncludes("globalStyles", ".df-skip-link:focus-visible", "visible skip link focus state");
assertIncludes("globalStyles", "outline: 2px solid hsl(var(--ring)) !important", "global keyboard focus outline");

assertIncludes("leadForm", "focus-visible:ring-[var(--funnel-accent)]", "public lead field focus ring");
assert.doesNotMatch(
  sources.leadForm,
  /text-\[#17283c\] outline-none/,
  "public lead fields must not remove focus without a replacement",
);
assertIncludes("metaSelections", 'id="meta-ad-account"', "Meta account programmatic label target");
assertIncludes("metaSelections", 'id="meta-facebook-page"', "Meta page programmatic label target");
assertIncludes("metaSelections", 'id="meta-pixel"', "Meta pixel programmatic label target");
assert.doesNotMatch(
  sources.metaSelections,
  /text-foreground outline-none/,
  "Meta selects must not remove focus without a replacement",
);

assertIncludes("feedbackWidget", "initialFocusRef.current?.focus()", "feedback dialog initial focus");
assertIncludes("feedbackWidget", 'event.key === "Escape"', "feedback dialog Escape close");
assertIncludes("feedbackWidget", "previousFocusRef.current?.focus()", "feedback dialog focus restoration");
assertIncludes("feedbackWidget", "querySelectorAll<HTMLElement>", "feedback dialog focus containment");
assertIncludes("feedbackWidget", 'aria-modal="true"', "feedback dialog modal semantics");

assertIncludes("loginForm", 'role="alert"', "login error live announcement");
assertIncludes("loginForm", 'role="status"', "login status live announcement");
assertIncludes(
  "loginForm",
  "const [isHydrated, setIsHydrated] = useState(false);",
  "login credentials must render fail-closed before hydration",
);
assert.match(
  sources.loginForm,
  /useEffect\(\(\) => \{\s*setIsHydrated\(true\);\s*}, \[\]\);/,
  "login credentials must unlock only after the client mount effect",
);
assert.match(
  sources.loginForm,
  /event\.preventDefault\(\);\s*if \(!isHydrated\) \{\s*return;\s*}/,
  "login submission must retain a fail-closed pre-hydration guard",
);
for (const fieldId of ["email", "password"]) {
  assert.ok(
    openingTagContaining("loginForm", "input", `id="${fieldId}"`).includes(
      "disabled={!isHydrated || isPending}",
    ),
    `${fieldId} credential input must remain disabled until hydration`,
  );
}
assert.ok(
  openingTagContaining("loginForm", "button", 'type="submit"').includes(
    "disabled={!isHydrated || !isConfigured || isPending}",
  ),
  "login submit must remain disabled until hydration and configuration readiness",
);
assertIncludes(
  "loginForm",
  'aria-label={t("auth.switchToSignIn")}',
  "sign-in mode control has a distinct accessible name",
);
assertIncludes(
  "loginForm",
  'aria-label={t("auth.switchToSignUp")}',
  "sign-up mode control has a distinct accessible name",
);
assert.match(
  sources.loginForm,
  /<p[^>]*>[\s\S]*\{branding\.appName\}[\s\S]*<\/p>/,
  "verified partner product name must remain visible independently of its logo alt text",
);
assertIncludes("leadForm", 'id="lead-capture-status"', "lead form status association");
assertIncludes("leadForm", 'role={status === "error" ? "alert" : "status"}', "lead form adaptive live role");
assertIncludes("feedbackWidget", 'role="status"', "feedback success live announcement");
assertIncludes("metaSelections", 'role="alert"', "Meta error live announcement");
assertIncludes("metaSelections", 'role="status"', "Meta selection status announcement");
assertIncludes("creativeWizard", 'aria-live="polite"', "creative selection count announcement");

assert.ok(
  (sources.homepage.match(/aria-pressed=/g) ?? []).length >= 3,
  "all homepage mode-control groups must expose pressed state",
);
assertIncludes("homepage", 'aria-controls="command-center-mode-panel"', "command-center control relationship");
assertIncludes("homepage", 'aria-controls="engine-mode-details"', "engine control relationship");
assertIncludes("creativeWizard", 'aria-pressed={selected}', "creative selection state");
assertIncludes("creativeWizard", 'role="group"', "creative selection group semantics");
assertIncludes("onboarding", 'aria-current={active ? "step" : undefined}', "onboarding current-step semantics");
assert.match(
  sources.onboarding,
  /<h1[^>]*>\{stepTitle\}<\/h1>/,
  "onboarding current step must remain the page-level heading",
);
assert.ok(
  (sources.onboarding.match(/aria-pressed=/g) ?? []).length >= 9,
  "onboarding selection controls must expose their selected state",
);
assertIncludes("onboarding", 'role="alert"', "onboarding error summary role");
assertIncludes("onboarding", 'aria-live="assertive"', "onboarding error summary live announcement");
assertIncludes("onboarding", "aria-invalid={Boolean(errors.market)}", "onboarding invalid field state");
assertIncludes("onboarding", 'aria-describedby={errors.market ? "onboarding-market-error" : undefined}', "onboarding field-to-error association");
assertIncludes("onboarding", 'id="onboarding-market-error"', "onboarding error description target");
assertIncludes("commandCenter", "aria-pressed={active}", "command-center agent selection state");
assertIncludes("topBar", 'aria-label={t("nav.settings")}', "settings link accessible name");
assertIncludes("topBar", '<Settings aria-hidden="true"', "decorative settings icon semantics");
assertIncludes("localeLink", "prefetch = false", "tenant navigation demand-driven prefetch default");
assertIncludes(
  "localeLink",
  "<Link href={localizedHref} prefetch={prefetch}",
  "locale link must forward its explicit prefetch policy",
);
assertIncludes(
  "localeSwitcher",
  "prefetch={false}",
  "locale switcher must not prefetch hidden alternate-language dashboards",
);
assert.equal(
  (sources.commandCenter.match(/prefetch=\{false\}/g) ?? []).length,
  2,
  "command-center issue links must not trigger speculative authenticated reads",
);

console.log(`accessibility and truth contract passed (${redirectCases.length} redirect cases)`);
