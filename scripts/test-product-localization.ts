#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ACCOUNT_DELETION_COPY } from "../src/lib/i18n/account-deletion-copy";
import { PRODUCT_LOCALES } from "../src/lib/i18n/config";
import { LEGAL_COPY } from "../src/lib/i18n/legal-copy";
import {
  getMissingProductMessageKeys,
  getProductMessageKeys,
  PRODUCT_MESSAGES,
} from "../src/lib/i18n/messages";
import { ONBOARDING_OPTION_CATALOG } from "../src/lib/i18n/onboarding-options";
import { PREPAYWALL_PREVIEW_COPY } from "../src/lib/i18n/prepaywall-preview-copy";
import {
  localizeProductHref,
  parseProductLocalePathname,
  replaceProductLocaleInPathname,
} from "../src/lib/i18n/routing";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const locales = [...PRODUCT_LOCALES];

function read(relativePath: string) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  if (Array.isArray(value)) {
    return Object.assign({}, ...value.map((item, index) => flatten(item, `${prefix}[${index}]`)));
  }
  if (!value || typeof value !== "object") return {};
  return Object.assign(
    {},
    ...Object.entries(value).map(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key)),
  );
}

function assertShapeParity(label: string, records: Record<string, unknown>) {
  const reference = Object.keys(flatten(records.en)).sort();
  assert.ok(reference.length > 0, `${label}: English reference must not be empty`);
  for (const locale of locales) {
    const flattened = flatten(records[locale]);
    assert.deepEqual(Object.keys(flattened).sort(), reference, `${label}: ${locale} shape drift`);
    for (const [path, value] of Object.entries(flattened)) {
      assert.ok(value.trim().length > 0, `${label}: blank ${locale}.${path}`);
    }
  }
}

function templateTokens(value: string) {
  return [...value.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map((match) => match[1]).sort();
}

assert.deepEqual(locales, ["en", "fr", "es"], "supported product locales must be exactly EN/FR/ES");

const messageKeys = getProductMessageKeys();
assert.ok(messageKeys.length >= 500, "message catalog unexpectedly small");
for (const locale of locales) {
  assert.deepEqual(getMissingProductMessageKeys(locale), [], `${locale} has missing messages`);
  assert.deepEqual(Object.keys(PRODUCT_MESSAGES[locale]).sort(), [...messageKeys].sort(), `${locale} message key drift`);
  for (const key of messageKeys) {
    const value = PRODUCT_MESSAGES[locale][key];
    assert.ok(value.trim(), `${locale}.${key} is blank`);
    assert.deepEqual(
      templateTokens(value),
      templateTokens(PRODUCT_MESSAGES.en[key]),
      `${locale}.${key} interpolation-token drift`,
    );
  }
}

const representativeMessageKeys = [
  "metadata.title",
  "common.continue",
  "nav.build",
  "onboarding.title.intent",
  "onboarding.destination.website",
  "billing.paywallDescription",
  "dashboard.title",
  "launch.finalReview",
  "settings.title",
  "support.title",
  "build.funnel.reviewTitle",
  "build.creatives.chooseTitle",
  "preview.finalTitle",
  "unlock.accessActive",
  "legal.privacy.title",
] as const;
for (const locale of ["fr", "es"] as const) {
  for (const key of representativeMessageKeys) {
    assert.notEqual(PRODUCT_MESSAGES[locale][key], PRODUCT_MESSAGES.en[key], `${locale}.${key} was not translated`);
  }
}

assertShapeParity("prepaywall preview", PREPAYWALL_PREVIEW_COPY);
assertShapeParity("legal copy", LEGAL_COPY);
assertShapeParity("account deletion", ACCOUNT_DELETION_COPY);

for (const locale of ["fr", "es"] as const) {
  for (const mode of ["buyer", "seller", "investor", "commercial"] as const) {
    const localized = ONBOARDING_OPTION_CATALOG[locale].modes[mode];
    const english = ONBOARDING_OPTION_CATALOG.en.modes[mode];
    for (const field of ["title", "summary", "path", "marketFallback", "audience", "propertyType", "offer"] as const) {
      assert.notEqual(localized[field], english[field], `${locale}.${mode}.${field} was not translated`);
    }
    assert.deepEqual(
      ONBOARDING_OPTION_CATALOG[locale].properties[mode].map((item) => item.id),
      ONBOARDING_OPTION_CATALOG.en.properties[mode].map((item) => item.id),
      `${locale}.${mode} property identity drift`,
    );
    assert.equal(
      ONBOARDING_OPTION_CATALOG[locale].offers[mode].length,
      ONBOARDING_OPTION_CATALOG.en.offers[mode].length,
      `${locale}.${mode} offer count drift`,
    );
  }
  assert.equal(
    ONBOARDING_OPTION_CATALOG[locale].leadQuestions.length,
    ONBOARDING_OPTION_CATALOG.en.leadQuestions.length,
    `${locale} lead-question count drift`,
  );
}

assert.deepEqual(parseProductLocalePathname("/fr/dashboard"), {
  locale: "fr", pathname: "/dashboard", hadLocalePrefix: true,
});
assert.deepEqual(parseProductLocalePathname("/dashboard"), {
  locale: "en", pathname: "/dashboard", hadLocalePrefix: false,
});
assert.equal(localizeProductHref("/dashboard?tab=leads#top", "es"), "/es/dashboard?tab=leads#top");
assert.equal(localizeProductHref("/fr/settings", "en"), "/en/settings");
assert.equal(localizeProductHref("/api/billing/status", "fr"), "/api/billing/status");
assert.equal(localizeProductHref("https://example.com", "fr"), "https://example.com");
assert.equal(localizeProductHref("//example.com", "fr"), "//example.com");
assert.equal(replaceProductLocaleInPathname("/es/onboarding", "fr"), "/fr/onboarding");

const localizedRoutes = [
  "page.tsx", "login/page.tsx", "onboarding/page.tsx", "dashboard/page.tsx",
  "launch/page.tsx", "launching/page.tsx", "launch-success/page.tsx", "settings/page.tsx",
  "support/page.tsx", "paywall/page.tsx", "builder/page.tsx", "results/page.tsx",
  "build/funnel/page.tsx", "build/creatives/page.tsx", "preview/page.tsx",
  "unlock/page.tsx", "campaign-built/page.tsx",
  "privacy/page.tsx", "terms/page.tsx", "data-deletion/page.tsx",
];
for (const route of localizedRoutes) {
  const alternatives = [
    resolve(ROOT, "src/app/[locale]", route),
    resolve(ROOT, "src/app/[locale]/(app)", route),
    resolve(ROOT, "src/app/[locale]/(auth)", route),
  ];
  assert.ok(alternatives.some(existsSync), `localized route missing: ${route}`);
}

const rootLayout = read("src/app/layout.tsx");
assert.ok(rootLayout.includes('requestHeaders.get("x-pathname")'), "root layout must derive locale from trusted pathname header");
assert.ok(rootLayout.includes("<html lang={locale}"), "server-rendered html lang must match route locale");
assert.ok(!rootLayout.includes('<html lang="en"'), "root layout must not hard-code English html language");

for (const [route, document] of [["privacy", "privacy"], ["terms", "terms"]] as const) {
  const source = read(`src/app/${route}/page.tsx`);
  assert.ok(source.includes("LocalizedLegalPage"), `root ${route} route must use canonical localized legal renderer`);
  assert.ok(source.includes(`LEGAL_COPY.en.${document}`), `root ${route} route must use canonical English legal copy`);
  assert.ok(!source.includes("April 28, 2026"), `root ${route} route must not retain stale legal copy`);
  assert.ok(!source.includes("raiaan@scaleholdings.co"), `root ${route} route must not retain stale support contact`);
}

const proxy = read("src/proxy.ts");
assert.ok(proxy.includes('requestHeaders.set("x-pathname", rawPathname)'), "proxy must pass the trusted raw pathname");
assert.ok(proxy.includes("parseProductLocalePathname"), "proxy must normalize locale-prefixed routes before authorization");

const sourceContracts: Array<[string, string[], string[]]> = [
  ["src/app/(app)/onboarding/page.tsx", ["useProductI18n()", "getOnboardingOptionCatalog(locale)", "createLocalizedDefaultDraft(locale)"], ["Smith Realty Group", 'title: "Website funnel"', 'title: "Meta Instant Form"']],
  ["src/components/onboarding/prepaywall-campaign-preview.tsx", ["PREPAYWALL_PREVIEW_COPY[locale]", "PREPAYWALL_PREVIEW_COPY[campaignLocale]"], [">Campaign preview<", "Sample CTA:", ">Watermarked<", "Static creative locked", "Meta Instant Form setup"]],
  ["src/components/dashboard/campaign-dashboard-view.tsx", ["useProductI18n()"], [">Dashboard<", "No campaigns yet", "Launch readiness summary"]],
  ["src/components/campaign/campaign-publish-panel.tsx", ["useProductI18n()"], [">Publish campaign<", "Campaign published"]],
  ["src/components/campaign/creative-strategy-summary.tsx", ["useProductI18n()"], [">Creative strategy<", "No strategy available"]],
  ["src/components/settings/account-deletion-card.tsx", ["ACCOUNT_DELETION_COPY[locale]", "idempotencyKeyRef"], [">Danger zone<", "Delete workspace and account</h2>", "Automated deletion is unavailable</h2>"]],
  ["src/app/data-deletion/page.tsx", ["LocalizedDataDeletionPage", 'locale="en"'], ["Meta request status", "How To Request Deletion"]],
  ["src/app/(app)/build/funnel/page.tsx", ["getRequestProductI18n()", "LocaleLink as Link", 't("build.funnel.reviewTitle")', 'redirect(href("/onboarding"))'], ['title="Review your funnel"', '>Live preview<', '>Advanced<', '>Looks good → Next<']],
  ["src/app/(app)/build/creatives/page.tsx", ["getRequestProductI18n()", 't("build.creatives.chooseTitle")', 'redirect(href("/onboarding"))'], ['title="Choose your creative test set"', 'headline: ad.headline || "Untitled ad"', 'cta: ad.cta || matchingCopy?.cta || "Learn More"']],
  ["src/app/(app)/build/creatives/creative-wizard.tsx", ["useProductI18n()", "LocaleLink as Link", "router.push(href("], [">Recommended test set<", ">View breakdown<", 'aria-label="Creative test set"', 'router.push(`/preview?']],
  ["src/app/(app)/preview/page.tsx", ["getRequestProductI18n()", "LocaleLink as Link", 't("preview.finalTitle")'], ['title="Final preview"', '>Creative preview<', '>Primary launch creative<', '>Selected funnel<']],
  ["src/app/(app)/unlock/page.tsx", ["getRequestProductI18n()", "LocaleLink as Link", 't("unlock.accessActive")'], ['eyebrow="Billing"', '>Go to launch<', '>View billing options<']],
  ["src/app/(app)/builder/page.tsx", ["getRequestProductI18n()", "redirect(href("], ["redirect(`${redirectUrl.pathname}${redirectUrl.search}`)"]],
  ["src/app/(app)/campaign-built/page.tsx", ["getRequestProductI18n()", "redirect(href("], ["redirect(buildCampaignScopedPath"]],
  ["src/app/results/page.tsx", ["getRequestProductI18n()", "redirect(href("], []],
  ["src/components/app/page-header.tsx", ["useProductI18n()", 't("common.guided")'], [">Guided<", "The system is guiding the next best action"]],
  ["src/components/ui/empty-state.tsx", ["useProductI18n()", 't("common.aiGuidanceReady")'], [">AI guidance ready<", "When this section is ready"]],
  ["src/components/app/wizard-steps.tsx", ["useProductI18n()", 't("wizard.step"'], ['title: "Onboarding"', 'title: "Launch"']],
  ["src/components/app/artifact-recovery-panel.tsx", ["useProductI18n()", "LocaleLink as Link", 't("recovery.regenerate")'], [">Recovery<", ">Missing artifacts<", ">Back to onboarding<"]],
  ["src/components/funnel/funnel-preview.tsx", ["useProductI18n()", 't("funnelPreview.landingPage"'], [">video block<", ">image block<", ">Quick capture<"]],
  ["src/components/campaign/static-creative-preview-card.tsx", ["useProductI18n()", 't("creativePreview.campaignCreative")'], [">Headline<", ">Primary Text<", ">CTA<"]],
  ["src/components/campaign/static-ad-composed-preview.tsx", ["useProductI18n()", 't("creativePreview.status.final")'], [">ROI brief<", ">Metric<", ">Opportunity<", ">Breaking news<", ">Primary text<"]],
];
for (const [path, required, forbidden] of sourceContracts) {
  const source = read(path);
  for (const marker of required) assert.ok(source.includes(marker), `${path} missing localization marker: ${marker}`);
  for (const marker of forbidden) assert.ok(!source.includes(marker), `${path} contains stale visible English marker: ${marker}`);
}

for (const locale of locales) {
  for (const document of ["privacy", "terms", "deletion"] as const) {
    assert.ok(LEGAL_COPY[locale][document].sections.length >= 4, `${locale}.${document} legal document incomplete`);
  }
}

console.log(JSON.stringify({
  status: "PASS",
  locales,
  messageKeys: messageKeys.length,
  localizedRoutes: localizedRoutes.length,
  catalogs: ["messages", "onboarding", "prepaywall", "account-deletion", "legal"],
  ssrHtmlLanguage: "proven-by-source-contract",
}, null, 2));
