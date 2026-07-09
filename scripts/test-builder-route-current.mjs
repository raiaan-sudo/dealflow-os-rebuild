import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("src/app/(app)/layout.tsx", "utf8");
const builderPage = fs.readFileSync("src/app/(app)/builder/page.tsx", "utf8");

assert.match(
  builderPage,
  /data-testid="dealflow-current-builder-shell"/,
  "/builder must expose a stable current-builder regression marker",
);

assert.match(
  builderPage,
  /data-builder-version="current"/,
  "/builder must declare the current builder version marker",
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

console.log("Builder route current-shell regression guard passed.");
