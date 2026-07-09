import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("src/app/(app)/layout.tsx", "utf8");
const builderPage = fs.readFileSync("src/app/(app)/builder/page.tsx", "utf8");

assert.match(
  builderPage,
  /redirect\(`\/onboarding/,
  "/builder must redirect into the canonical onboarding package-preview flow",
);

assert.doesNotMatch(
  builderPage,
  /CampaignBuilderWorkspace/,
  "/builder must not render the separate editor shell that regressed the onboarding experience",
);

assert.match(
  layout,
  /pathname\.startsWith\("\/builder"\)/,
  "/builder must be treated as a focused product route",
);

assert.match(
  layout,
  /if \(isFocusedProductRoute\)/,
  "focused product routes must bypass the legacy authenticated app shell",
);

assert.doesNotMatch(
  layout,
  /<AppSidebar[\s\S]*isFocusedProductRoute[\s\S]*<\/main>/,
  "/builder focus route must not render AppSidebar inside its focused branch",
);

console.log("Builder route canonical-onboarding redirect guard passed.");
