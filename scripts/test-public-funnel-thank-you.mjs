#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const formSource = fs.readFileSync("src/app/f/[slug]/lead-capture-form.tsx", "utf8");
const funnelPageSource = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");
const thankYouPageSource = fs.readFileSync("src/app/f/[slug]/thank-you/page.tsx", "utf8");
const trackerSource = fs.readFileSync("src/app/f/[slug]/thank-you/thank-you-conversion-tracker.tsx", "utf8");
const thankYouModelSource = fs.readFileSync("src/lib/public-funnel-thank-you.ts", "utf8");
const languageSource = fs.readFileSync("src/lib/public-funnel-language.ts", "utf8");
const documentLanguageSource = fs.readFileSync("src/app/f/[slug]/public-funnel-document-language.tsx", "utf8");
const pixelConsentSource = fs.readFileSync("src/components/privacy/meta-pixel-consent-control.tsx", "utf8");
const leadRouteSource = fs.readFileSync("src/app/api/lead-capture/route.ts", "utf8");
const leadHandlerSource = fs.readFileSync("src/lib/services/lead-handler-service.ts", "utf8");

function assertOrdered(source, patterns, message) {
  let cursor = -1;
  for (const pattern of patterns) {
    const index = source.indexOf(pattern, cursor + 1);
    assert.ok(index > cursor, message);
    cursor = index;
  }
}

assert.match(thankYouPageSource, /export const dynamic = "force-dynamic"/, "thank-you route must render dynamically and publicly");
assert.match(thankYouPageSource, /getPublishedCampaignBySlug\(resolvedParams\.slug\)/, "thank-you route must load the published public funnel");
assert.match(thankYouPageSource, /notFound\(\)/, "invalid thank-you slug must safe-fail");
assert.doesNotMatch(thankYouPageSource, /getAuthenticatedContext|createAdminClient|user_id|organization_id.*<\/|owner_id/, "thank-you route must not expose private auth/admin data");
assert.match(thankYouPageSource, /LEGACY_PUBLIC_FUNNEL_SLUG_REDIRECTS/, "legacy paid slug must be supported on thank-you route");
assertOrdered(
  thankYouPageSource,
  [
    "const redirectSlug = LEGACY_PUBLIC_FUNNEL_SLUG_REDIRECTS",
    "getPublishedCampaignBySlug(resolvedParams.slug)",
  ],
  "legacy thank-you redirect must run before campaign lookup",
);

assert.match(thankYouPageSource, /view\.headline/, "thank-you route must confirm receipt with localized copy");
assert.match(thankYouPageSource, /view\.watchForUsBody/, "thank-you route must set localized follow-up expectations");
assert.match(thankYouPageSource, /view\.privacyBody/, "thank-you route must keep localized compliance-safe copy");
assert.match(thankYouPageSource, /view\.primaryLink/, "thank-you route must render booking CTA only when configured");
assert.match(thankYouPageSource, /view\.secondaryLink/, "thank-you route must render return fallback");
assert.match(thankYouPageSource, /lang=\{view\.language\}/, "thank-you content must declare its stored language");
assert.match(thankYouPageSource, /PublicFunnelDocumentLanguage language=\{view\.language\}/, "thank-you route must synchronize the document language");
assert.match(thankYouPageSource, /language=\{view\.language\}/, "thank-you privacy controls must use the same language");
assert.match(thankYouPageSource, /export async function generateMetadata/, "thank-you route must generate localized metadata");
assert.match(thankYouPageSource, /"content-language": view\.language/, "thank-you metadata must carry the normalized language");
assert.match(thankYouPageSource, /robots: \{ index: false, follow: true \}/, "thank-you confirmation pages must not be indexed");

assert.match(thankYouModelSource, /booking_url|bookingUrl|calendar_url|calendarUrl|calendly/, "thank-you model must support configurable booking links");
assert.match(thankYouModelSource, /url\.protocol === "https:" \|\| url\.protocol === "http:"/, "thank-you model must allow only public http(s) links");
assert.match(thankYouModelSource, /primaryLink: bookingUrl \?/, "booking CTA must appear only when configured");
assert.match(thankYouModelSource, /secondaryLink:/, "return fallback must always exist");
assert.match(thankYouModelSource, /getPublicFunnelLanguage\(record\)/, "thank-you model must derive language from the persisted funnel");
assert.match(thankYouModelSource, /getPublicFunnelThankYouExpectation/, "thank-you expectations must be localized");
assert.match(thankYouModelSource, /getPublicFunnelThankYouHeadline/, "thank-you headline must use the canonical localized funnel copy");

assert.match(funnelPageSource, /getPublicFunnelLanguage\(record\)/, "public funnel must normalize the persisted language");
assert.match(funnelPageSource, /lang=\{language\}/, "public funnel content must declare its stored language");
assert.match(funnelPageSource, /PublicFunnelDocumentLanguage language=\{language\}/, "public funnel must synchronize the document language");
assert.match(funnelPageSource, /language=\{language\}/, "public funnel must pass language to its form and privacy control");
assert.match(funnelPageSource, /cta=\{record\.funnel\.cta \|\| copy\.defaultCta\}/, "empty CTA must use a localized safe fallback");
assert.match(funnelPageSource, /export async function generateMetadata/, "public funnel must generate localized metadata");
assert.match(funnelPageSource, /"content-language": language/, "public funnel metadata must carry the normalized language");
assert.match(funnelPageSource, /getPublicFunnelOpenGraphLocale\(language\)/, "public funnel Open Graph metadata must use the matching locale");

assert.match(languageSource, /normalizeWinningFunnelLanguage\(value\)/, "unsupported public languages must fall back through the canonical EN\/FR\/ES normalizer");
assert.match(languageSource, /fr_CA/, "French metadata must declare a French locale");
assert.match(languageSource, /es_ES/, "Spanish metadata must declare a Spanish locale");
assert.match(languageSource, /privacyBody/, "localized thank-you copy must include privacy\/consent language");
assert.match(documentLanguageSource, /document\.documentElement\.lang = normalizedLanguage/, "hydrated public journeys must synchronize the root document language");
assert.match(documentLanguageSource, /document\.documentElement\.lang = previousLanguage/, "document language must restore after leaving the public funnel");
assert.match(pixelConsentSource, /normalizePublicFunnelLanguage\(language\)/, "pixel consent must share the safe language fallback");
assert.match(pixelConsentSource, /Choix de suivi marketing/, "pixel consent must include French copy");
assert.match(pixelConsentSource, /Opciones de seguimiento de marketing/, "pixel consent must include Spanish copy");

assert.match(formSource, /submitInFlightRef/, "lead form must synchronously block duplicate submits");
assert.match(
  formSource,
  /disabled=\{status === "submitting" \|\| Boolean\(TURNSTILE_SITE_KEY && !turnstileToken\)\}/,
  "lead form button must disable during submission and until configured human verification succeeds",
);
assert.equal(
  (formSource.match(/prefetch=\{false\}/g) ?? []).length,
  2,
  "public funnel legal links must not create speculative reads during Turnstile proof",
);
assert.match(formSource, /href="\/privacy" prefetch=\{false\}/);
assert.match(formSource, /href="\/terms" prefetch=\{false\}/);
assert.match(formSource, /data\?\.success !== true \|\| data\?\.ok !== true/, "lead form must redirect only on confirmed success");
assert.match(formSource, /window\.location\.assign\(thankYouUrl\.toString\(\)\)/, "lead form must redirect to thank-you after confirmed success");
assert.match(formSource, /getCurrentPageAttribution/, "lead form must explicitly capture current page attribution");
assert.match(formSource, /utm_source: attribution\.utmSource/, "lead form must submit UTM source attribution");
assert.match(formSource, /ad_id: attribution\.adId/, "lead form must submit Meta ad id attribution");
assert.match(formSource, /landing_page_url: attribution\.landingPageUrl/, "lead form must submit the current landing page URL");
assert.match(formSource, /await waitForMetaPixelDispatch\(\)/, "lead form must give the browser Lead pixel a short dispatch window before redirect");
assertOrdered(
  formSource,
  [
    "if (!response.ok)",
    "data?.success !== true",
    "window.location.assign(thankYouUrl.toString())",
  ],
  "validation and delayed responses must not redirect before confirmed success",
);
assertOrdered(
  formSource,
  [
    "const thankYouUrl = new URL",
    "window.location.assign(thankYouUrl.toString())",
    "return;",
    "} catch",
  ],
  "successful lead capture must redirect before any post-submit cleanup can interrupt navigation",
);
const successRedirectBlock = formSource.slice(
  formSource.indexOf("const leadId ="),
  formSource.indexOf("} catch"),
);
assert.doesNotMatch(successRedirectBlock, /resetTurnstile\(|setName\(|setEmail\(|setPhone\(|setSmsConsent\(/, "success path must not reset form state before thank-you navigation");
assert.match(formSource, /sms_consent: Boolean\(showPhone && normalizedPhone && smsConsent\)/, "SMS consent payload must stay intact");
assert.match(formSource, /turnstile_token: turnstileToken \|\| undefined/, "lead form must submit the verified Turnstile token");
assert.match(formSource, /data-action="lead_capture"/, "lead form Turnstile action must match the server contract");
assert.match(formSource, /data-sitekey=\{TURNSTILE_SITE_KEY\}/, "lead form must use the configured public Turnstile site key");
assert.match(
  formSource,
  /NEXT_PUBLIC_LEAD_TURNSTILE_SITE_KEY[\s\S]*NEXT_PUBLIC_TURNSTILE_SITE_KEY/,
  "lead capture must support a dedicated staging-safe site key without enabling auth CAPTCHA",
);
assert.match(formSource, /normalizePublicFunnelLanguage\(language\)/, "lead form must safely normalize unsupported language values");
assert.match(formSource, /copy\.validationQuestions/, "qualification validation must use localized copy");
assert.match(formSource, /aria-label=\{copy\.humanVerification\}/, "human verification must have a localized accessible name");
assert.match(formSource, /lang=\{normalizedLanguage\}/, "lead form must explicitly declare its language");
assert.match(leadRouteSource, /parseLandingPageAttribution/, "lead capture route must backfill attribution from the landing URL");
assert.match(leadRouteSource, /url\.searchParams\.get\("utm_content"\)/, "lead capture route must treat Meta utm_content as ad id attribution");
assert.match(leadRouteSource, /utm_source: utmSource \?\? undefined/, "lead capture route must persist normalized UTM source");
assert.match(leadRouteSource, /landing_page_url: landingPageUrl/, "lead capture route must pass the resolved landing page URL into atomic persistence");
assert.match(leadHandlerSource, /eventSourceUrl: input\.landing_page_url\?\.trim\(\) \|\| null/, "atomic side-effect payload must use the persisted landing page URL for Meta CAPI");
assert.match(leadHandlerSource, /utm_source|utm_medium|utm_campaign|ad_id|landing_page_url/, "lead handler must support attribution fields");

assert.match(trackerSource, /CompleteRegistration/, "thank-you route should prepare a conversion event");
assert.match(trackerSource, /sessionStorage\.getItem\(storageKey\)/, "thank-you conversion should avoid duplicate refresh tracking");

assertOrdered(
  leadHandlerSource,
  [
    'select("plan, public_slug")',
    "public_slug: currentPlan.public_slug ?? campaignPlanRow?.public_slug ?? null",
    "buildCampaignPlanCriticalFieldPatch(nextPlan)",
  ],
  "lead-loop verification must preserve row public_slug before writing campaign critical fields",
);
assert.doesNotMatch(
  leadHandlerSource,
  /markCampaignLeadLoopVerified[\s\S]*?select\("plan"\)[\s\S]*?buildCampaignPlanCriticalFieldPatch/,
  "lead-loop verification must not derive public_slug from plan-only reads",
);

console.log("public funnel thank-you regression checks passed");
