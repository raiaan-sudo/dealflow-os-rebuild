#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const plans = readFileSync("src/lib/billing/plans.ts", "utf8");
const presentation = readFileSync("src/lib/billing/plan-presentation.ts", "utf8");

assert.match(plans, /starter:[\s\S]*priceLabel:\s*"\$147\/mo"/, "Starter must remain $147/mo in code");
assert.match(plans, /pro:[\s\S]*priceLabel:\s*"\$297\/mo"/, "Pro must remain $297/mo in code");
assert.match(plans, /growth:[\s\S]*priceLabel:\s*"\$497\/mo"/, "Growth must remain $497/mo in code");
assert.doesNotMatch(plans, /\$97\/mo|\b9700\b/, "Code must not use the legacy $97 Starter price");
assert.doesNotMatch(presentation, /\$97\/mo|\b9700\b/, "Plan presentation must not use the legacy $97 Starter price");

console.log("Stripe price guard tests passed.");
