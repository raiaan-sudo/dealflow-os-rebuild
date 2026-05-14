# Compliance Guardrails

This document is operational guidance for drafting and QA. It is not legal
advice. Do not use any outbound copy in a live call, SMS, voicemail, ad, funnel,
or workflow until qualified legal review confirms the exact jurisdiction,
consent status, data source, suppression-list process, and opt-out handling.

Official starting points:

- FCC TCPA/robocall and robotext consumer guidance:
  https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts
- FCC TCPA one-to-one consent consumer guide:
  https://docs.fcc.gov/public/attachments/DOC-408396A1.pdf
- FTC Telemarketing Sales Rule resources:
  https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule
- FTC National Do Not Call Registry FAQ:
  https://consumer.ftc.gov/articles/national-do-not-call-registry-faqs
- CRTC CASL guidance:
  https://crtc.gc.ca/eng/com500/guide.htm
- CRTC CASL act, regulations, and guidelines:
  https://crtc.gc.ca/eng/internet/anti/reg.htm
- Canada National DNCL:
  https://lnnte-dncl.gc.ca/en
- HUD Fair Housing Act overview:
  https://www.hud.gov/helping-americans/fair-housing-act-overview
- HUD fair housing rights and obligations:
  https://www.hud.gov/stat/fheo/rights-obligations

## Automatic-Fail Rules

Reject the copy before any style scoring if it contains any of these:

- misleading identity, fake local presence, fake referral, fake buyer, or fake
  relationship;
- fake urgency, fabricated scarcity, or pressure that implies the lead will
  lose a protected housing opportunity unless they respond;
- protected-class targeting language or implications around race, color,
  religion, national origin, sex, familial status, disability, age, marital
  status, immigration status, or other locally protected categories;
- guaranteed home value, savings, mortgage approval, appreciation, profit,
  under-market access, off-market buyer, or sale outcome;
- deception, intimidation, guilt, shame, or hard-pressure closing;
- SMS without a required opt-out path where SMS requires it;
- claims that imply illegal steering, exclusion, preference, or discrimination;
- use of private, sensitive, inferred, or scraped personal lead data in copy
  unless source, consent, and use have been explicitly approved;
- hidden sender identity, missing company/agent identity, or unclear reason for
  contact;
- any instruction to call, text, submit, launch, generate provider assets, or
  create live campaigns from this docs system.

## TCPA And SMS Risk

For United States campaigns, treat marketing calls and texts as high-risk unless
the owner can prove the consent basis, number source, opt-out status, and DNC
screening. Text messages can be treated as calls under TCPA guidance. Automated
or prerecorded calls, autodialed texts, and marketing texts may require prior
express written consent depending on channel, technology, and context.

Operational rules:

- Never assume a phone-bearing lead is SMS-eligible.
- Store consent evidence outside copy: timestamp, page/form, disclosure, phone
  number, seller/brand, and revocation status.
- If consent is unknown, draft only for review and mark `not live-use approved`.
- Respect opt-out language such as `STOP`, `unsubscribe`, `remove me`, `do not
  contact`, and equivalent natural-language revocations.
- Do not send additional marketing after opt-out except one legally reviewed
  confirmation if allowed by the operating policy.

## FTC TSR And Do Not Call Risk

The FTC Telemarketing Sales Rule and National Do Not Call rules create risk for
sales calls, seller/telemarketer conduct, disclosures, abandoned calls,
misrepresentations, and DNC suppression. State mini-TCPA and telemarketing laws
may be stricter.

Operational rules:

- Screen against applicable national, state, internal, and client DNC lists
  before live use.
- Keep internal DNC requests and do-not-contact records durable.
- Promptly disclose truthful identity and purpose on calls.
- Do not imply affiliation with MLS, government, lender, courthouse, another
  brokerage, or a named agent unless true and approved.
- Do not hide caller ID or use misleading caller names.

## CASL, CRTC, And Canadian DNCL Risk

For Canadian commercial electronic messages, CASL generally centers on consent,
sender identification, and unsubscribe mechanics. The National DNCL governs
telemarketing calls and gives telemarketers responsibilities to register,
subscribe, scrub, and stop contacting registered numbers after applicable
timelines.

Operational rules:

- Treat Canadian SMS and email as consent-first.
- Include clear sender identification and an unsubscribe mechanism when required.
- Honor unsubscribe requests within the required processing window; operationally
  aim for immediate suppression.
- Screen telemarketing calls against National DNCL and internal suppression.
- Do not rely on implied consent without legal review and evidence.

## Fair Housing And Real Estate Language

Real estate copy must avoid discriminatory statements, steering, preferences, or
audience exclusions tied to protected classes. This applies to listing copy,
buyer/seller funnels, ads, SMS, calls, voicemails, and qualification language.

Unsafe:

- "Perfect for young families."
- "Safe Christian neighborhood."
- "Only professionals without kids."
- "Great area for immigrants from [country]."
- "We help people with bad credit get approved no matter what."
- "Exclusive homes before everyone else because of who you are."

Safer:

- "Three-bedroom home near parks and transit."
- "Homes matching your budget, timeline, commute, and must-haves."
- "A plan to compare payment, location, and inspection tradeoffs."
- "Listings and options available through lawful broker/agent channels."

## Safe And Unsafe Urgency

Safe urgency is tied to a real, factual next step.

Safe:

- "If you want, I can send the shortlist today."
- "I am setting up this week's buyer list and can include your criteria."
- "If selling this year is on the table, a 10-minute pricing check can prevent
  guessing."

Unsafe:

- "You will miss out if you do not respond now."
- "Only selected buyers get this before the public."
- "Rates are about to explode; you need to act today."
- "I already have a buyer guaranteed for your house."

## Private Listing And Early Access Language

Do not imply unlawful private access, insider treatment, or protected-class
preference. "Private shortlist" means a curated list built from lawful sources
and buyer criteria, not secret inventory.

Safe:

- "I can build a shortlist from active, coming-soon where permitted, and agent
  network options that match your criteria."
- "I can send homes that fit budget, area, timing, and must-haves."

Unsafe:

- "Secret listings no one else can see."
- "Exclusive access before the market because you qualify."
- "Off-market homes guaranteed under value."

## Disclaimers And Opt-Out Examples

SMS examples need legal review and jurisdiction-specific tailoring:

- "DealFlow Realty: I can send a short list of homes that match [area] and
  [budget]. Reply STOP to opt out."
- "Hi [first_name], this is [agent_name] with [brokerage]. Is [timeline] still
  your rough plan for [buying/selling]? Reply STOP to opt out."
- "Sorry about that. I will mark this as the wrong number and stop texting."

Call identity example:

- "Hi [first_name], this is [agent_name] with [brokerage]. I know this is out of
  the blue, so I will be brief."

Legal-review note for every campaign:

> Draft only. Do not send or call until legal/compliance approves consent,
> DNC/suppression, sender identity, opt-out, fair housing, claims, and local law.
