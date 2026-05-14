# Cold SMS Framework

SMS copy must be shorter, clearer, and more compliance-sensitive than call copy.
Do not send any SMS from this repository. These templates are drafting assets
only and require consent, suppression, opt-out, sender identity, and legal
review before live use.

## Required SMS Fields

- `[first_name]`
- `[agent_name]`
- `[brokerage]`
- `[market]`
- `[offer]`
- `[source_context]` only when approved and non-sensitive
- `[opt_out_line]` such as "Reply STOP to opt out" when required

## Base Sequence

| Step | Template | Compliance Notes | Personalization Fields | Max Length | CTA Strength | Use When | Do Not Use When |
| --- | --- | --- | --- | --- | --- | --- | --- |
| First touch | "Hi [first_name], this is [agent_name] with [brokerage]. Are you still looking around [market], or did that pause? [opt_out_line]" | Identify sender; include opt-out where required; no sensitive data. | first_name, agent_name, brokerage, market, opt_out_line | 240 chars | Soft | Consent/source is approved and buyer intent is non-sensitive. | Consent is unknown or DNC/opt-out status is unresolved. |
| Follow-up 1 | "Quick follow-up, [first_name]. I can send a short [market] list matched to budget/timing if that helps. Useful, or not relevant? [opt_out_line]" | One offer, no hype, opt-out. | first_name, market, opt_out_line | 240 chars | Medium | No reply after first touch. | Lead objected, opted out, or is angry. |
| Follow-up 2 | "Should I close the loop here, or would a simple [offer] still be useful? Either answer is fine. [opt_out_line]" | Gives permission to decline; opt-out. | offer, opt_out_line | 220 chars | Soft | Prior touches were unanswered. | High complaint risk or too many recent touches. |
| Soft close | "No worries if timing changed. I can mark this as paused unless you want the [offer]. [opt_out_line]" | Respectful close; no pressure. | offer, opt_out_line | 220 chars | Soft | Last no-response touch. | Any negative or stop request occurred. |
| Appointment ask | "If it helps, I can do a 10-min [offer] walkthrough today or tomorrow. Worth checking, or should I just send the short version? [opt_out_line]" | Clear time ask; not coercive. | offer, opt_out_line | 260 chars | Strong | Lead has engaged or asked questions. | First cold touch without context. |
| Reactivation | "Hi [first_name], [agent_name] here. We spoke before about [buying/selling] in [market]. Is that still active, paused, or solved? [opt_out_line]" | Avoid pretending recent relationship; identify sender. | first_name, agent_name, buying/selling, market, opt_out_line | 260 chars | Medium | Prior relationship is documented. | Relationship/source cannot be verified. |
| No-response sequence | "I will leave this alone after this. If [buying/selling] in [market] comes back up, I can help with [offer]. [opt_out_line]" | Clear finality; opt-out. | buying/selling, market, offer, opt_out_line | 260 chars | Soft | Final outreach. | Any opt-out or wrong-number signal. |
| Opt-out handling | "Understood. I will mark you as opted out." | Send only if policy/legal review allows one confirmation. | none | 80 chars | None | Recipient says STOP/remove/do not contact. | Policy says no confirmation or opt-out was already processed. |
| Wrong number | "Sorry about that. I will mark this as the wrong number and stop texting." | Suppress number; no further marketing. | none | 90 chars | None | Recipient says wrong number. | Never use as a chance to pitch. |
| Interested reply | "Got it. What matters most right now: [option_1], [option_2], or [option_3]?" | Move to qualification; avoid sensitive questions. | approved options | 160 chars | Medium | Recipient shows interest. | They asked to call a human immediately. |
| Angry reply | "I hear you. I will stop contacting this number." | Stop; route to human/compliance if needed. | none | 80 chars | None | Recipient is upset or threatens complaint. | Never defend, debate, or continue selling. |

## Variant Library

| Variant | Template | CTA |
| --- | --- | --- |
| Direct | "Hi [first_name], [agent_name] with [brokerage]. Are you still planning to [buy/sell] in [market], or is that off the table? [opt_out_line]" | Reply active/paused/off |
| Curiosity-based | "Quick question, [first_name]: would a [market] [offer] be useful, or are you not looking right now? [opt_out_line]" | Useful/not looking |
| Value-first | "I can send a short [offer] for [market] if it saves you searching. Want it? [opt_out_line]" | Yes/no |
| Problem-first | "A lot of [market] buyers are seeing listings that do not match payment reality. Want a tighter budget-fit list? [opt_out_line]" | Want list? |
| Referral-style | "Hi [first_name], [agent_name] with [brokerage]. I am checking who in [market] still needs help with [offer]. Is that relevant to you? [opt_out_line]" | Relevant/not relevant |
| Soft permission | "I may be early here. Is it okay if I ask one quick [buying/selling] question? [opt_out_line]" | Okay/no |
| Appointment-first | "Would a 10-min [offer] call this week help, or would you rather I send the short version? [opt_out_line]" | Call/short version |

## SMS Style Rules

- One idea per message.
- Keep most first touches under 240 characters.
- Do not stack links in cold first-touch messages.
- Do not use fake urgency, all caps, emojis, or hype.
- Do not reference sensitive inferred data.
- Always stop on opt-out, wrong number, represented-party conflict, angry reply,
  or legal threat.
- Route financing, legal, fair-housing, and contract questions to a licensed
  human where required.
