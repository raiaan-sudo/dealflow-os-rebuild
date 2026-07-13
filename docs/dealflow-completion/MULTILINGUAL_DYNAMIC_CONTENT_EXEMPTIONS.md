# DealFlow multilingual dynamic-content boundary

DealFlow product chrome, onboarding options, previews, validation, billing, dashboard controls, support, settings, account deletion, and legal routes are first-party UI and must render in the selected product locale (`en`, `fr`, or `es`). The localization contract test fails on missing catalog entries, route drift, server-rendered `<html lang>` drift, and known hard-coded English regressions in critical surfaces.

The following values are intentionally not translated at render time:

- Names, brokerage names, markets, offers, questions, and other text entered by a user.
- Provider-owned identifiers, statuses, error codes, campaign names, and records returned by Meta, Stripe, GoHighLevel, Twilio, or a creative provider.
- Previously persisted AI or optimizer prose that has no trusted locale receipt. French and Spanish dashboard surfaces show a reviewed localized summary instead of presenting unverified English prose as translated output.
- Brand names, email addresses, URLs, currency codes, product plan names, and canonical safety phrases whose exact value is operationally significant.

Generated campaign content follows the persisted campaign language, which may intentionally differ from the product interface language. Product controls around that content continue to follow the selected product locale. New generation workflows must persist a locale receipt before provider output can be treated as language-proven.
