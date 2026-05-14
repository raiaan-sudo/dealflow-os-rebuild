#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const requiredDocs = [
  "docs/outbound-copy-os/README.md",
  "docs/outbound-copy-os/compliance-guardrails.md",
  "docs/outbound-copy-os/cold-call-framework.md",
  "docs/outbound-copy-os/cold-sms-framework.md",
  "docs/outbound-copy-os/voicemail-and-follow-up-framework.md",
  "docs/outbound-copy-os/audience-offer-map.md",
  "docs/outbound-copy-os/objection-library.md",
  "docs/outbound-copy-os/psychology-rules.md",
  "docs/outbound-copy-os/copy-scoring-rubric.md",
  "docs/outbound-copy-os/testing-runbook.md",
  "docs/outbound-copy-os/media-buyer-feedback-intake.md",
  "docs/outbound-copy-os/field-results-analysis.md",
];

const requiredPrompts = [
  "docs/outbound-copy-os/prompts/generate-cold-call-script.md",
  "docs/outbound-copy-os/prompts/generate-sms-sequence.md",
  "docs/outbound-copy-os/prompts/generate-voicemail-script.md",
  "docs/outbound-copy-os/prompts/generate-objection-handling.md",
  "docs/outbound-copy-os/prompts/rewrite-for-compliance.md",
  "docs/outbound-copy-os/prompts/rewrite-for-human-tone.md",
  "docs/outbound-copy-os/prompts/score-copy.md",
  "docs/outbound-copy-os/prompts/generate-ab-test-variants.md",
  "docs/outbound-copy-os/prompts/analyze-field-results.md",
  "docs/outbound-copy-os/prompts/build-campaign-copy-pack.md",
  "docs/outbound-copy-os/prompts/media-buyer-gpt-request.md",
];

const requiredExamples = [
  "docs/outbound-copy-os/examples/buyer-cold-call.md",
  "docs/outbound-copy-os/examples/seller-cold-call.md",
  "docs/outbound-copy-os/examples/buyer-sms.md",
  "docs/outbound-copy-os/examples/seller-sms.md",
  "docs/outbound-copy-os/examples/expired-listing.md",
  "docs/outbound-copy-os/examples/fsbo.md",
  "docs/outbound-copy-os/examples/reactivation.md",
  "docs/outbound-copy-os/examples/bad-copy-examples.md",
  "docs/outbound-copy-os/examples/before-after-rewrites.md",
];

const requiredTerms = [
  "Do not send",
  "opt-out",
  "Compliance",
  "Score",
  "Automatic",
  "fair housing",
  "STOP",
];

let failures = 0;

function checkFile(path) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    failures += 1;
    console.log(`MISSING ${path}`);
    return "";
  }

  const content = readFileSync(fullPath, "utf8");
  console.log(`OK ${path}`);
  return content;
}

console.log("DealFlow Outbound Copy OS checklist");
console.log("Print-only local validation. No APIs, no outbound, no provider generation, no data mutation.");
console.log("");

console.log("Required docs");
const docContent = requiredDocs.map(checkFile).join("\n");
console.log("");

console.log("Required prompts");
const promptContent = requiredPrompts.map(checkFile).join("\n");
console.log("");

console.log("Required examples");
const exampleContent = requiredExamples.map(checkFile).join("\n");
console.log("");

console.log("Required safety/scoring terms");
const allContent = `${docContent}\n${promptContent}\n${exampleContent}`;
for (const term of requiredTerms) {
  const found = allContent.toLowerCase().includes(term.toLowerCase());
  if (!found) {
    failures += 1;
  }
  console.log(`${found ? "OK" : "MISSING"} term: ${term}`);
}

console.log("");
console.log("Outbound safety checklist");
console.log("- Do not send SMS.");
console.log("- Do not make calls.");
console.log("- Do not submit forms.");
console.log("- Do not create live campaigns.");
console.log("- Do not trigger provider generation.");
console.log("- Do not expose credential values.");
console.log("- Require legal/compliance review before live use.");

if (failures > 0) {
  console.log("");
  console.log(`Copy OS checklist failed with ${failures} missing item(s).`);
  process.exit(1);
}

console.log("");
console.log("Copy OS checklist passed.");
