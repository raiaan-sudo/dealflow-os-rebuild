#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const renderer = fs.readFileSync("src/app/f/[slug]/canonical-public-funnel-page.tsx", "utf8");
const publicRoute = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");
const leadForm = fs.readFileSync("src/app/f/[slug]/lead-capture-form.tsx", "utf8");
const builder = fs.readFileSync("src/lib/public-funnel/canonical-public-funnel.ts", "utf8");

const leadFormIdCount = [...renderer.matchAll(/id=\{CANONICAL_PUBLIC_FORM_ID\}/g)].length;
assert.equal(leadFormIdCount, 1, "canonical public renderer must contain exactly one #lead-form anchor");
assert.match(renderer, /href=\{`#\$\{CANONICAL_PUBLIC_FORM_ID\}`\}/, "hero CTA must target #lead-form");
assert.match(renderer, /scroll-mt-6/, "#lead-form must have mobile-safe scroll margin");
assert.match(renderer, /h-12[^"]*items-center[^"]*justify-center/, "hero CTA must be visible and tappable");
assert.match(leadForm, /<button[\s\S]*type="submit"/, "lead form must render a submit button");
assert.match(leadForm, /h-12 w-full/, "lead form submit button must be mobile-tappable");
assert.match(leadForm, /fbclid/, "lead form must preserve fbclid attribution");
assert.match(leadForm, /gclid/, "lead form must preserve gclid attribution");
assert.match(leadForm, /utm_source: attribution\.utmSource/, "lead form must preserve UTM source attribution");
assert.doesNotMatch(publicRoute, /visibleSections\.map|section\.type|record\.funnel\.sections/, "public route must not render flexible sections that can bury the form");
assert.match(builder, /BANNED_PUBLIC_SECTION_TYPES/, "canonical builder must detect banned legacy sections");

for (const bannedText of [
  "Legacy FAQ",
  "Legacy Process",
  "Legacy Market Snapshot",
  "Legacy Form",
  "Legacy Closing CTA",
]) {
  assert.doesNotMatch(renderer, new RegExp(bannedText), `${bannedText} must not appear in fixed public renderer`);
}

console.log("public funnel mobile conversion checks passed");

