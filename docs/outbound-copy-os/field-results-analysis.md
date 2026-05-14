# Field Results Analysis

Use this document to turn real outbound results into improved prompts, examples,
rubrics, and guardrails without exposing private lead data.

## Input Rules

Use aggregate or redacted data only:

- audience;
- market;
- offer;
- channel;
- variant name;
- send/call date range;
- volume;
- reply categories;
- appointment outcomes;
- complaint/opt-out counts;
- anonymized objection themes;
- representative snippets only if approved and redacted.

Do not paste phone numbers, names, addresses, email addresses, CRM IDs, private
notes, payment data, credential values, or sensitive inferences.

## Analysis Questions

1. Which variant produced the highest qualified positive reply rate?
2. Which variant produced the lowest complaint and opt-out rate?
3. Which objection appeared most often?
4. Did the offer match the audience's actual pain?
5. Did the CTA ask for too much too early?
6. Did personalization help, feel neutral, or create distrust?
7. Did sender identity or source questions appear?
8. Did any line create fair-housing, credit, income, urgency, or deception risk?
9. Which script line should be promoted into examples?
10. Which line should become a bad-copy warning?

## Output Format

```text
Field Results Summary
- Audience:
- Offer:
- Channel:
- Variant count:
- Time window:
- Volume:
- Positive reply rate:
- Appointment rate:
- Opt-out rate:
- Complaint rate:

Findings
- Winner:
- Loser:
- Primary objection:
- Compliance notes:
- Trust notes:
- Appointment friction:

Copy OS Updates
- Prompt updates:
- Rubric updates:
- Example updates:
- Automatic-fail updates:
- Tests/checklist updates:
```

## Decision Rules

- Do not promote a variant on reply rate alone.
- A variant with higher complaints loses unless legal/compliance approves a
  narrow interpretation and owner accepts the risk.
- If recipients ask "how did you get my number?" repeatedly, improve source
  transparency and re-check source/consent.
- If appointments no-show, improve qualification and expectation setting before
  increasing pressure.
- If "send me info" dominates, the CTA may be too strong or the offer unclear.
