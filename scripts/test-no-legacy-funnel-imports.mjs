#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CUSTOMER_SURFACES = [
  "src/app/(app)/onboarding",
  "src/app/(app)/builder",
  "src/app/(app)/build",
  "src/app/(app)/preview",
  "src/app/(app)/launch",
  "src/app/f",
  "src/app/api/campaigns",
  "src/app/api/builder",
  "src/components/campaign",
  "src/components/funnel",
];

const ALLOWED_LEGACY_REFERENCES = new Set([
  "src/lib/funnels/legacy/legacy-funnel-engine.ts",
  "src/lib/services/funnel-engine.ts",
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

const offenders = [];

for (const surface of CUSTOMER_SURFACES) {
  for (const file of walk(surface)) {
    const normalized = file.split(path.sep).join("/");
    if (ALLOWED_LEGACY_REFERENCES.has(normalized)) continue;
    const source = fs.readFileSync(file, "utf8");
    if (/funnels\/legacy|generateLegacyFunnel|legacyFunnelEngine|legacyDirectResponseFunnel/i.test(source)) {
      offenders.push(normalized);
    }
  }
}

assert.equal(offenders.length, 0, `Customer-facing funnel surfaces must not import or render legacy funnel code:\n${offenders.join("\n")}`);

console.log("no legacy funnel import checks passed.");
