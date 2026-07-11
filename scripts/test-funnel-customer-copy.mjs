import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = [
  "src/lib/services/funnel-engine.ts",
  "src/lib/funnels/winning-template/build-winning-funnel.ts",
];
const forbiddenRenderedLabels = [
  /`Primary CTA:/,
  /`Problem:/,
  /`Mechanism:/,
  /"Proof before commitment"/,
  /"How the mechanism works"/,
  /"Offer and risk reversal"/,
];

for (const file of files) {
  const source = await readFile(file, "utf8");

  for (const pattern of forbiddenRenderedLabels) {
    assert.doesNotMatch(source, pattern, `${file} still contains ${pattern}`);
  }
}

const funnelSource = await readFile("src/lib/services/funnel-engine.ts", "utf8");
assert.match(funnelSource, /createSection\("hero", headline, \[subheadline\]/);
assert.match(funnelSource, /createSection\("process", "How it works"/);
assert.match(funnelSource, /The next step stays focused through/);

const winningSource = await readFile(
  "src/lib/funnels/winning-template/build-winning-funnel.ts",
  "utf8",
);
assert.match(winningSource, /\[microLabel, subheadline\]/);
assert.match(winningSource, /"Name, email, and phone only\."/);

console.log("funnel customer copy: PASS");
