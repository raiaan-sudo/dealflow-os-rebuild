# DealFlow Outbound Copy OS

This directory is the repo-based operating system for creating, scoring,
rewriting, and improving DealFlow real estate outbound copy. It is intentionally
docs/workflow/tooling only: it does not send messages, place calls, submit
forms, create live campaigns, run provider generation, mutate production data,
or expose credential values.

## Use Contract

Use this system when a Codex agent or owner needs cold call scripts, SMS
sequences, voicemail scripts, objection handling, follow-ups, campaign copy
packs, or field-result analysis for DealFlow outbound.

Required workflow:

1. Define the audience, market, offer, channel, consent/source status, broker or
   agent identity, and desired next step.
2. Select the matching offer in `audience-offer-map.md`.
3. Generate first draft copy with a prompt from `prompts/`.
4. Apply `compliance-guardrails.md` automatic-fail rules before style edits.
5. Score with `copy-scoring-rubric.md`.
6. Rewrite until every active asset scores at least 8/10 overall and 10/10 for
   compliance safety.
7. Save approved examples, field results, and lessons into this directory before
   future reuse.

## File Map

- `compliance-guardrails.md`: operational legal-risk guardrails and automatic
  fail rules.
- `cold-call-framework.md`: audience-specific cold call scripts and branch
  responses.
- `cold-sms-framework.md`: SMS sequence templates, variants, compliance notes,
  length limits, and response handling.
- `voicemail-and-follow-up-framework.md`: voicemail, callback, and follow-up
  patterns.
- `audience-offer-map.md`: buyer and seller audience-to-offer logic.
- `objection-library.md`: call and SMS responses with stop/human-routing rules.
- `psychology-rules.md`: conversion principles that keep copy specific,
  credible, and human.
- `copy-scoring-rubric.md`: 1-10 QA scoring and rewrite rules.
- `testing-runbook.md`: field test design, iteration cadence, and holdout rules.
- `media-buyer-feedback-intake.md`: structured process for importing feedback
  from a media buyer GPT or specialist.
- `field-results-analysis.md`: how to convert reply, appointment, complaint,
  and unsubscribe data into prompt/rubric changes.
- `prompts/`: reusable generation, rewrite, scoring, and analysis prompts.
- `examples/`: strong copy, bad copy, rewrites, and compliance notes.

## Safety Floor

No generated copy is live-use approved until a human owner and qualified legal
review confirm the jurisdiction, consent posture, Do Not Call handling,
fair-housing language, opt-out mechanics, and sender identification. Treat all
templates as drafting tools, not legal advice.

## Output Standard

Every generated asset should include:

- audience and offer;
- channel and consent/source assumption;
- personalization fields;
- compliance notes;
- primary script or message;
- follow-up path;
- objection handling path;
- scorecard;
- specific rewrite instructions if any criterion is below threshold.

## Local Validation

Run the deterministic checklist after editing this system:

```bash
source /Users/raiaanreza/.nvm/nvm.sh && nvm use 20.20.2
npm run copy:validate
```

The checklist only reads local docs and prints missing items. It never sends
messages, calls external APIs, creates campaigns, or mutates data.
