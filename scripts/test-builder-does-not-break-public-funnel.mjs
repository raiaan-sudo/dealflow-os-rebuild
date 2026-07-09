import assert from "node:assert/strict";
import fs from "node:fs";

const publicRoute = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");
const canonicalPage = fs.readFileSync("src/app/f/[slug]/canonical-public-funnel-page.tsx", "utf8");
const canonicalBuilder = fs.readFileSync("src/lib/public-funnel/canonical-public-funnel.ts", "utf8");
const builderPanels = fs.readFileSync("src/components/campaign/builder/builder-panels.tsx", "utf8");

assert.match(
  publicRoute,
  /CanonicalPublicFunnelPage/,
  "public /f/[slug] must continue rendering CanonicalPublicFunnelPage",
);

assert.match(
  publicRoute,
  /getValidatedPublicFunnel\(record\) \?\? buildCanonicalPublicFunnel\(record\)/,
  "public /f/[slug] must use validated canonical public funnel snapshots with canonical fallback",
);

assert.match(
  canonicalBuilder,
  /validateCanonicalPublicFunnel\(funnelModel\)/,
  "canonical public funnel builder must continue validating output",
);

assert.doesNotMatch(
  canonicalPage,
  /record\.funnel\.sections|funnel\.sections\.map/,
  "public canonical renderer must not regress to arbitrary internal funnel sections",
);

assert.match(
  builderPanels,
  /FunnelLivePreview/,
  "builder may keep its internal editing preview without changing public funnel rendering",
);

console.log("Builder recovery public-funnel invariant guard passed.");
