# Testing Runbook

This runbook defines how to evaluate copy without sending messages from Codex or
triggering live outbound systems. Field tests must be launched only through
approved owner workflows after consent, DNC/suppression, compliance, and legal
review.

## Pre-Test Checklist

- Audience and offer selected from `audience-offer-map.md`.
- Copy scored with `copy-scoring-rubric.md`.
- Compliance safety is 10/10.
- Opt-out and sender identification are approved for channel/jurisdiction.
- DNC, internal suppression, wrong-number, and opt-out handling are confirmed.
- Lead source and consent posture are documented outside the copy.
- Test volume, holdout, and stop conditions are approved by owner.

## Test Design

| Test Type | Use For | Rule |
| --- | --- | --- |
| A/B variant | Comparing hook, offer, CTA, or tone. | Change one major variable at a time. |
| Holdout | Measuring incremental lift. | Keep a no-contact or current-control group where lawful and operationally possible. |
| Sequential test | Improving weak copy after a full cycle. | Do not judge before enough replies or a fixed time window. |
| Qualitative review | Low-volume or high-risk audiences. | Use human review and call notes before scaling. |

## Metrics

Track by audience, offer, channel, variant, source, and date:

- delivery/connection rate;
- reply rate;
- positive reply rate;
- negative reply rate;
- opt-out rate;
- complaint rate;
- appointment booking rate;
- appointment show rate;
- qualified opportunity rate;
- conversion to next step;
- common objections;
- exact language that triggered positive/negative replies.

## Stop Conditions

Stop or pause a variant if:

- opt-out or complaint rate exceeds owner-approved threshold;
- recipients repeatedly ask how their number was obtained;
- copy causes confusion about sender identity;
- any protected-class, credit, income, guarantee, or fair-housing risk appears;
- a compliance reviewer flags a concern;
- field reps report the script creates distrust or arguments.

## Iteration Loop

1. Export aggregate results only; do not paste private lead data into prompts.
2. Summarize what happened by variant and audience.
3. Use `prompts/analyze-field-results.md`.
4. Update examples, bad-copy notes, rubric, or automatic-fail rules when a
   pattern is durable.
5. Keep the old version for comparison until the new version is proven.

## Testing Rules

- Do not optimize for replies if complaints rise.
- Do not use "hotter" urgency unless the urgency is factual and approved.
- Do not hide opt-out to improve response rate.
- Do not target or exclude protected classes.
- Do not use private/sensitive fields to improve personalization.
- Do not scale a variant that works only because it misleads.
