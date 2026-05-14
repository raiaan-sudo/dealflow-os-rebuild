# Media Buyer Feedback Intake

Use this process to ask a media buyer friend or trained media-buyer GPT for
feedback, then convert that feedback into durable DealFlow Copy OS updates.
Never paste secrets, private lead data, customer PII, provider credentials, or
unapproved internal data.

## Request Package

Send the media buyer:

- market and brokerage context;
- target audience and source/consent summary;
- offer and funnel step;
- cold call script;
- SMS sequence;
- voicemail/follow-up path;
- ad hook or funnel hook if relevant;
- current scoring rubric;
- explicit safety constraints;
- exact questions from `prompts/media-buyer-gpt-request.md`.

Ask for feedback on:

- targeting strategy;
- audience rules;
- Meta housing category constraints;
- static ad rules;
- AI UGC rules;
- funnel rules;
- SMS/call feedback;
- offer feedback;
- compliance risks;
- best hooks;
- worst hooks;
- QA rubric;
- launch checklist.

## Feedback Conversion

| Feedback Type | Update Target | Acceptance Rule |
| --- | --- | --- |
| Better hook pattern | `examples/before-after-rewrites.md` and relevant prompt | Must be compliance-safe and audience-specific. |
| New compliance concern | `compliance-guardrails.md` and automatic-fail rules | Must be phrased as operational guardrail pending legal review. |
| Better scoring criterion | `copy-scoring-rubric.md` | Must make QA more repeatable. |
| Audience insight | `audience-offer-map.md` | Must map to pain, emotion, CTA, and bad version to avoid. |
| Field-tested script improvement | Examples plus prompt template | Must preserve source context and result notes. |
| Meta or ad constraint | Relevant marketing/media docs and prompt | Must not imply live launch or provider generation. |

## Intake Review Steps

1. Remove any private lead data or credential values before saving feedback.
2. Separate opinion from field evidence.
3. Convert only durable lessons into docs.
4. Add a bad-copy example when feedback identifies a repeatable failure.
5. Add a validation checklist item if the issue is easy to catch.
6. Run `npm run copy:validate`.

## Non-Negotiables

- Media buyer feedback does not override legal review.
- A high-response hook is rejected if it increases deception, spam complaints,
  fair-housing risk, or opt-out friction.
- AI UGC and static ad recommendations must respect DealFlow's existing
  Marketing Studio worker and provider proof rules.
