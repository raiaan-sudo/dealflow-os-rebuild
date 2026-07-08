import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/integrations/meta/instant-form-contract.ts", "utf8");

for (const expected of [
  "short_text",
  "paragraph",
  "email",
  "phone",
  "multiple_choice",
  "single_choice",
  "required: question.required !== false",
  "options.length < 2",
  "payload_hash",
]) {
  assert.match(source, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `question contract must include ${expected}`);
}

const builderStart = source.indexOf("export function buildMetaInstantFormPayload");
const builderSource = source.slice(builderStart);

assert.ok(
  builderSource.indexOf("params.questions.map") < builderSource.indexOf("payload_hash"),
  "question order must be preserved before payload hashing",
);

console.log("Meta question mapping contract passed.");
