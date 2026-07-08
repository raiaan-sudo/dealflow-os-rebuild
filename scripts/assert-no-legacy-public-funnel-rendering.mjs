#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const publicRoute = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");
const canonicalRenderer = fs.readFileSync("src/app/f/[slug]/canonical-public-funnel-page.tsx", "utf8");

const bannedRoutePatterns = [
  /visibleSections\.map/,
  /record\.funnel\.sections/,
  /funnel\.sections\.map/,
  /section\.type/,
  /section\.content/,
];

for (const pattern of bannedRoutePatterns) {
  assert.doesNotMatch(
    publicRoute,
    pattern,
    `public /f/[slug] route must not render legacy flexible funnel sections: ${pattern}`,
  );
}

assert.match(
  publicRoute,
  /getValidatedPublicFunnel\(record\) \?\? buildCanonicalPublicFunnel\(record\)/,
  "public route must use validated canonical public funnel snapshots with builder fallback",
);
assert.match(
  publicRoute,
  /CanonicalPublicFunnelPage/,
  "public route must delegate rendering to the fixed canonical public funnel renderer",
);
assert.match(
  canonicalRenderer,
  /data-public-funnel-preset=\{funnel\.presetVersion\}/,
  "canonical renderer must expose the preset version for proof and debugging",
);
assert.match(
  canonicalRenderer,
  /id=\{CANONICAL_PUBLIC_FORM_ID\}/,
  "canonical renderer must anchor the one allowed public lead form",
);
assert.match(
  canonicalRenderer,
  /href=\{`#\$\{CANONICAL_PUBLIC_FORM_ID\}`\}/,
  "canonical renderer CTA must scroll to the canonical form anchor",
);

console.log("legacy public funnel renderer guard passed");

