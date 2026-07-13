# DealFlow multilingual product contract

Status: `EN/FR/ES SOURCE CONTRACT INTEGRATED / FINAL-SEAL PROOF NOT_YET_RUN / HOSTED BROWSER PROOF NOT_YET_RUN`

## Canonical language authority

The validated persisted campaign plan is the language authority. Supported
values are exactly English (`en`), French (`fr`) and Spanish (`es`). Missing,
legacy or unsupported values normalize safely to English; arbitrary input never
selects executable markup, locale routing or provider behavior.

## Required propagation

The normalized language must remain identical through:

1. onboarding selection and persisted campaign plan;
2. generated funnel, copy and creative prompt context;
3. campaign review and public website-funnel destination;
4. document/content language and localized metadata/Open Graph locale;
5. lead form labels, validation, consent/privacy text and CTA;
6. thank-you heading, next step, follow-up expectation and return links;
7. Meta Instant Form qualification questions; and
8. GHL campaign personalization values and receipts.

Public metadata uses `en_CA`, `fr_CA` and `es_ES` locale mappings. The hydrated
public-funnel document language must be restored when leaving that route so one
campaign cannot leak its language into another surface.

## Safety and truth

- Stored campaign language outranks browser locale and generated copy.
- Public/legal/consent language falls back to reviewed English when a localized
  key is absent; it must not display an empty string or a different campaign's
  language.
- User-authored follow-up text may remain user-authored, but system labels and
  privacy/consent truth must use the normalized campaign language.
- Website funnels and Meta Instant Forms share language authority but remain
  separate capture destinations.
- Translation does not weaken Turnstile, consent, qualification, tenant, GHL or
  Meta gates.

## Required proof

The final exact-seal portfolio must test every locale plus unsupported/missing
fallback across plan construction, rendered funnel, metadata, form validation,
consent, thank-you state, Meta qualification and GHL personalization.

Hosted staging must run desktop/mobile Chromium, Firefox and WebKit for EN/FR/ES
with Axe, keyboard, reduced-motion and 200% zoom checks; submit only clearly
synthetic staging leads under the zero-external-effects contract. It must verify
stored lead/campaign language and exact GHL/Meta routing without real
communication or provider spend.

Final exact-seal result: `NOT_YET_RUN`.
Hosted multilingual result: `NOT_YET_RUN`.
Production multilingual canary: `NOT_YET_RUN`.

No live lead, provider action, customer communication or production mutation is
claimed by this contract.
