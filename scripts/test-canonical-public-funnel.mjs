#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const constants = fs.readFileSync("src/lib/public-funnel/constants.ts", "utf8");
const types = fs.readFileSync("src/lib/public-funnel/types.ts", "utf8");
const schema = fs.readFileSync("src/lib/public-funnel/schema.ts", "utf8");
const builder = fs.readFileSync("src/lib/public-funnel/canonical-public-funnel.ts", "utf8");
const events = fs.readFileSync("src/lib/public-funnel/public-funnel-events.ts", "utf8");
const publicRoute = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");
const renderer = fs.readFileSync("src/app/f/[slug]/canonical-public-funnel-page.tsx", "utf8");
const leadForm = fs.readFileSync("src/app/f/[slug]/lead-capture-form.tsx", "utf8");
const persistence = fs.readFileSync("src/lib/services/campaign-persistence.ts", "utf8");
const generateFunnelRoute = fs.readFileSync("src/app/api/generate-funnel/route.ts", "utf8");

for (const type of ["faq", "process", "market_snapshot", "objections", "form", "closing_cta", "vsl", "image"]) {
  assert.match(constants, new RegExp(`"${type}"`), `${type} must remain banned from public flexible rendering`);
}

assert.match(constants, /CURRENT_PUBLIC_FUNNEL_PRESET_VERSION = "dealflow-public-v1"/, "canonical preset version must be stable");
assert.match(types, /export type CanonicalPublicFunnel =/, "canonical public funnel type must exist");
assert.match(types, /offerCard:/, "canonical public funnel must use fixed slots instead of arbitrary sections");
assert.match(schema, /z\.literal\(CURRENT_PUBLIC_FUNNEL_PRESET_VERSION\)/, "schema must enforce the current preset version");
assert.match(schema, /id: z\.literal\(CANONICAL_PUBLIC_FORM_ID\)/, "schema must enforce the single canonical form id");
assert.doesNotMatch(types, /\bsections:/, "canonical public funnel type must not expose arbitrary sections");

assert.match(builder, /buildCanonicalPublicFunnelResult/, "builder must expose a build result with blocked-section diagnostics");
assert.match(builder, /collectBlockedSectionTypes/, "builder must detect legacy public section types");
assert.match(builder, /BANNED_PUBLIC_SECTION_TYPES/, "builder must use the centralized banned section list");
assert.match(builder, /LEGACY_PUBLIC_COPY_PATTERNS/, "builder must block known regurgitated public funnel copy");
assert.match(builder, /cleanPublicCopy/, "builder must sanitize inherited public copy before rendering");
assert.match(builder, /delivered through a tighter property selection process/i, "builder must explicitly sanitize the Hamza-style legacy phrase");
assert.match(builder, /validateCanonicalPublicFunnel\(funnelModel\)/, "builder output must be schema-validated");
assert.match(builder, /getValidatedPublicFunnel/, "runtime must support validated persisted snapshots");
assert.match(events, /public_funnel\.legacy_sections_ignored/, "blocked legacy sections must be observable");

assert.doesNotMatch(publicRoute, /visibleSections\.map|record\.funnel\.sections|section\.type/, "public route must not render flexible sections directly");
assert.match(publicRoute, /getValidatedPublicFunnel\(record\) \?\? buildCanonicalPublicFunnel\(record\)/, "public route must use canonical snapshot plus fallback");
assert.match(renderer, /CanonicalPublicFunnelPage/, "fixed canonical renderer must exist");
assert.match(renderer, /LeadCaptureForm/, "fixed renderer must include the lead form");
assert.match(renderer, /id=\{CANONICAL_PUBLIC_FORM_ID\}/, "fixed renderer must include the one canonical form anchor");

assert.match(leadForm, /lead_form_viewed/, "lead form must emit view telemetry");
assert.match(leadForm, /lead_form_started/, "lead form must emit started telemetry");
assert.match(leadForm, /lead_form_submit_attempted/, "lead form must emit submit-attempt telemetry");
assert.match(leadForm, /lead_form_validation_failed/, "lead form must emit validation telemetry");
assert.match(leadForm, /lead_capture_client_success/, "lead form must emit client success telemetry");
assert.match(leadForm, /lead_capture_client_failed/, "lead form must emit client failure telemetry");
assert.match(leadForm, /navigator\.sendBeacon\("\/api\/client-errors"/, "lead telemetry must be non-blocking via sendBeacon");
assert.doesNotMatch(leadForm, /turnstile_token|turnstileToken|useTurnstileWidget/, "public customer funnels must not require Turnstile");

assert.match(persistence, /publicFunnelPresetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION/, "campaign saves must stamp the canonical public preset");
assert.match(persistence, /publicFunnel: buildCanonicalPublicFunnel\(canonical\)/, "campaign saves must persist the canonical public funnel");
assert.match(persistence, /attachCanonicalPublicFunnel\(record as unknown as Record<string, unknown>\)/, "publish snapshots must attach canonical public funnel");
assert.match(generateFunnelRoute, /publicFunnelPresetVersion: CURRENT_PUBLIC_FUNNEL_PRESET_VERSION/, "funnel regeneration must stamp the canonical public preset");
assert.match(generateFunnelRoute, /publicFunnel: buildCanonicalPublicFunnel/, "funnel regeneration must rebuild the canonical public funnel");

console.log("canonical public funnel regression checks passed");
