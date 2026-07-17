import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REALTOR_QUALIFICATION_CATALOG_VERSION,
  hasOnlyApprovedRealtorQualificationQuestions,
  resolveMetaInstantFormQualificationQuestions,
} from "../src/lib/meta-instant-form-qualification";

const approved = {
  en: "When are you hoping to move?",
  fr: "Quand souhaitez-vous déménager?",
  es: "¿Cuándo esperas mudarte?",
} as const;

assert.match(REALTOR_QUALIFICATION_CATALOG_VERSION, /^2026-07-16\./);
for (const language of ["en", "fr", "es"] as const) {
  assert.equal(
    hasOnlyApprovedRealtorQualificationQuestions({
      language,
      questions: [approved[language]],
    }),
    true,
  );
  assert.equal(
    resolveMetaInstantFormQualificationQuestions({
      leadCaptureMode: "quality_funnel",
      language,
      customQuestions: [approved[language]],
    })[0],
    approved[language],
  );
  assert.equal(
    resolveMetaInstantFormQualificationQuestions({
      leadCaptureMode: "deep_qualification",
      language,
      customQuestions: [],
    }).length,
    3,
  );
}
assert.equal(
  hasOnlyApprovedRealtorQualificationQuestions({
    language: "en",
    questions: ["What is your age?"],
  }),
  false,
);
assert.deepEqual(
  resolveMetaInstantFormQualificationQuestions({
    leadCaptureMode: "volume_lead_form",
    language: "en",
    customQuestions: [approved.en],
  }),
  [],
);

const route = readFileSync(
  new URL("../src/app/api/onboarding/plan/route.ts", import.meta.url),
  "utf8",
);
assert.ok(
  route.indexOf("hasOnlyApprovedRealtorQualificationQuestions") <
    route.indexOf("saveCampaignPlan(buildCampaignInput"),
  "question authority must be validated before campaign persistence",
);
assert.match(route, /qualification_question_unsupported/);
const onboarding = readFileSync(
  new URL("../src/app/(app)/onboarding/page.tsx", import.meta.url),
  "utf8",
);
assert.doesNotMatch(onboarding, /addCustomLeadFormQuestion/);

console.log("fixed EN/FR/ES realtor qualification contract passed");
