#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const formSource = fs.readFileSync("src/app/f/[slug]/lead-capture-form.tsx", "utf8");
const thankYouPageSource = fs.readFileSync("src/app/f/[slug]/thank-you/page.tsx", "utf8");
const trackerSource = fs.readFileSync("src/app/f/[slug]/thank-you/thank-you-conversion-tracker.tsx", "utf8");
const thankYouModelSource = fs.readFileSync("src/lib/public-funnel-thank-you.ts", "utf8");
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

assert.match(thankYouPageSource, /Your request was received|view\.headline/, "thank-you route must confirm receipt");
assert.match(thankYouPageSource, /Keep an eye on your phone and email/, "thank-you route must set follow-up expectations");
assert.match(thankYouPageSource, /Consent is not a condition of purchase/, "thank-you route must keep compliance-safe copy");
assert.match(thankYouPageSource, /view\.primaryLink/, "thank-you route must render booking CTA only when configured");
assert.match(thankYouPageSource, /view\.secondaryLink/, "thank-you route must render return fallback");

assert.match(thankYouModelSource, /booking_url|bookingUrl|calendar_url|calendarUrl|calendly/, "thank-you model must support configurable booking links");
assert.match(thankYouModelSource, /url\.protocol === "https:" \|\| url\.protocol === "http:"/, "thank-you model must allow only public http(s) links");
assert.match(thankYouModelSource, /primaryLink: bookingUrl \?/, "booking CTA must appear only when configured");
assert.match(thankYouModelSource, /secondaryLink:/, "return fallback must always exist");

assert.match(formSource, /submitInFlightRef/, "lead form must synchronously block duplicate submits");
assert.match(
  formSource,
  /disabled=\{status === "submitting" \|\| Boolean\(TURNSTILE_SITE_KEY && !turnstileToken\)\}/,
  "lead form button must disable during submission and until configured human verification succeeds",
);
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
assert.match(leadRouteSource, /parseLandingPageAttribution/, "lead capture route must backfill attribution from the landing URL");
assert.match(leadRouteSource, /url\.searchParams\.get\("utm_content"\)/, "lead capture route must treat Meta utm_content as ad id attribution");
assert.match(leadRouteSource, /utm_source: utmSource \?\? undefined/, "lead capture route must persist normalized UTM source");
assert.match(leadRouteSource, /eventSourceUrl: landingPageUrl/, "Meta CAPI event source URL must use the resolved landing page URL");
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
