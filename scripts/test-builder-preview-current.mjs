import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("src/components/campaign/campaign-builder-workspace.tsx", "utf8");
const panels = fs.readFileSync("src/components/campaign/builder/builder-panels.tsx", "utf8");
const types = fs.readFileSync("src/components/campaign/builder/types.ts", "utf8");

assert.doesNotMatch(
  workspace,
  /previewTab|setPreviewTab|PreviewPaneTab/,
  "customer builder workspace must not carry the legacy preview-tab state",
);

assert.doesNotMatch(
  panels,
  /previewTab|setPreviewTab|PreviewPaneTab/,
  "customer builder preview panel must not render the legacy Funnel/Ads/Assets tab switcher",
);

assert.doesNotMatch(
  types,
  /PreviewPaneTab/,
  "legacy preview pane tab type must not be reintroduced",
);

assert.match(
  panels,
  /mode\?: "funnel" \| "creatives"/,
  "builder preview must expose explicit customer-facing modes instead of internal tabs",
);

assert.match(
  panels,
  /Customer funnel/,
  "default builder preview must identify the customer-facing funnel surface",
);

assert.match(
  workspace,
  /mode="creatives"/,
  "creative step must render the creative package mode without using the old tab switcher",
);

console.log("Builder preview current-surface regression guard passed.");
