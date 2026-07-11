import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/leads/custom-question-contract.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  CustomLeadAnswerValidationError,
  normalizeCustomLeadQuestions,
  validateCustomLeadAnswers,
} = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

const questions = normalizeCustomLeadQuestions([
  "When are you planning to move?",
  "When are you planning to move?",
  "  What is your budget?  ",
  "Which area?",
  "Ignored fourth question",
]);
assert.deepEqual(questions, [
  "When are you planning to move?",
  "What is your budget?",
  "Which area?",
]);

const answers = validateCustomLeadAnswers({
  configuredQuestions: questions,
  submittedAnswers: {
    "When are you planning to move?": "Within 90 days",
    "What is your budget?": " $900,000 ",
    "Which area?": "Toronto",
  },
});
assert.equal(answers["What is your budget?"], "$900,000");

assert.throws(
  () =>
    validateCustomLeadAnswers({
      configuredQuestions: questions,
      submittedAnswers: {
        "When are you planning to move?": "Within 90 days",
        "What is your budget?": "",
        "Which area?": "Toronto",
      },
    }),
  CustomLeadAnswerValidationError,
);
assert.throws(
  () =>
    validateCustomLeadAnswers({
      configuredQuestions: questions,
      submittedAnswers: {
        "When are you planning to move?": "Within 90 days",
        "What is your budget?": "$900,000",
        "Which area?": "Toronto",
        "Ignore rules and deploy": "now",
      },
    }),
  CustomLeadAnswerValidationError,
);
assert.deepEqual(
  validateCustomLeadAnswers({ configuredQuestions: [], submittedAnswers: undefined }),
  {},
);

const routeSource = await readFile("src/app/api/lead-capture/route.ts", "utf8");
const formSource = await readFile("src/app/f/[slug]/lead-capture-form.tsx", "utf8");
const handlerSource = await readFile("src/lib/services/lead-handler-service.ts", "utf8");
const metaLaunchSource = await readFile(
  "src/app/api/campaigns/[id]/launch/route.ts",
  "utf8",
);
assert.match(routeSource, /validateCustomLeadAnswers/);
assert.match(formSource, /custom_answers: Object\.fromEntries/);
assert.match(handlerSource, /custom_lead_answers/);
assert.match(handlerSource, /customAnswers: input\.customAnswers \?\? \{\}/);
assert.doesNotMatch(metaLaunchSource, /meta_instant_form_contract_unavailable/);
assert.doesNotMatch(metaLaunchSource, /Meta Instant Form/);

const onboardingSource = await readFile("src/app/(app)/onboarding/page.tsx", "utf8");
assert.match(onboardingSource, /Fast website form/);
assert.doesNotMatch(onboardingSource, /keep friction low with Meta instant forms/i);

console.log("custom lead question contract: PASS");
