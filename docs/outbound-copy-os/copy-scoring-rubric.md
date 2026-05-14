# Copy Scoring Rubric

Score every outbound asset before it can be considered ready for owner review.
Compliance safety is non-negotiable: anything below 10/10 for compliance safety
requires rewrite or rejection.

## Criteria

| Criterion | 10/10 | 7/10 | 4/10 |
| --- | --- | --- | --- |
| Clarity | One audience, one offer, one CTA, instantly understandable. | Understandable but slightly wordy or mixed. | Unclear, vague, or overloaded. |
| Relevance | Directly fits audience, market, timing, and source context. | Generally relevant but could apply to many people. | Generic or mismatched. |
| Personalization | Uses approved, non-sensitive fields naturally. | Uses basic name/market only. | Uses no useful context or creepy/sensitive context. |
| Credibility | Claims are modest, true, and supportable. | Some claims need proof or softening. | Hype, guarantees, fake authority, or unverifiable proof. |
| Emotional resonance | Names a real friction without pressure. | Has a benefit but weak emotional driver. | Pure feature pitch or fear-based pressure. |
| Response likelihood | Easy yes/no or short reply path. | Reply path exists but has friction. | No clear reason to reply. |
| Appointment likelihood | Clear reason a call is worth time. | Appointment ask exists but value is thin. | Asks for meeting before value. |
| Compliance safety | No automatic fails; identity, opt-out, claims, fair housing, and data use are safe for review. | Not allowed; rewrite until 10. | Not allowed; reject. |
| Human tone | Sounds like a concise local professional. | Slightly scripted but usable. | AI, corporate, pushy, or spammy. |
| CTA quality | One low-friction next step. | CTA is clear but too strong/weak for context. | Multiple CTAs or no CTA. |
| Spam risk | Low volume feel, no hype, opt-out where needed. | Some words or cadence may trigger complaints. | Hype, fake urgency, links, or repeated pressure. |
| Objection readiness | Has branch responses for likely objections. | Covers only common branches. | Leaves obvious objections unresolved. |

## Automatic Fail

Reject immediately if copy has any automatic-fail item from
`compliance-guardrails.md`, including misleading identity, fake urgency,
protected-class language, guarantees, pressure/deception, missing required
opt-out, discriminatory housing implications, or unapproved sensitive data use.

## Overall Decision

- `approved for owner review`: every criterion 8+ and compliance safety 10.
- `rewrite required`: any criterion 5-7 or compliance safety below 10.
- `reject`: any automatic fail or any criterion below 5.

## Rewrite Instructions

For each score below 8:

1. Name the exact issue.
2. State why it hurts replies, appointments, trust, or compliance.
3. Rewrite only the smallest necessary section.
4. Re-score the revised version.
5. Do not increase pressure to increase response likelihood.

## QA Output Format

```text
Asset:
Audience:
Offer:
Channel:
Consent/source assumption:

Scores:
- clarity:
- relevance:
- personalization:
- credibility:
- emotional resonance:
- response likelihood:
- appointment likelihood:
- compliance safety:
- human tone:
- CTA quality:
- spam risk:
- objection readiness:

Automatic fails:
Decision:
Required rewrites:
Approved version:
```
