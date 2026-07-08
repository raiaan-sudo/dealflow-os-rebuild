# Meta Instant Form Live/Test Proof Follow-Up

DealFlow currently fails closed for `instant_form` / `meta_instant_form` launch modes. This is intentional: the repository has not yet proven real Meta leadgen form creation, custom question sync, persisted `leadgen_form_id`, and lead retrieval.

## Required Assets

- Meta staging/test Business Manager access.
- Test Page with lead ads permission.
- Test ad account with no spend risk.
- Test pixel if website/CAPI comparison is needed.
- Marketing API token with required lead ads scopes.
- Privacy policy URL for the test form.

## Proof Steps

1. Enable only in staging/test with a future explicit gate.
2. Build the Meta leadgen form payload from `src/lib/integrations/meta/instant-form-contract.ts`.
3. Create or reuse a leadgen form through the Marketing API.
4. Persist `leadgen_form_id`, payload hash, and question mapping.
5. Build an ad creative that references the form ID, not website `link_data`.
6. Keep all campaigns/ad sets/ads `PAUSED`.
7. Use Meta Lead Ads Testing Tool to submit a test lead.
8. Verify answer retrieval maps to DealFlow lead fields and custom answers.
9. Verify stale edited questions create a new form version/hash.
10. Only after this proof should the product expose native Meta instant forms.

## Non-Negotiable Guard

Until the above is complete, DealFlow must not claim native Meta instant form behavior while launching a website-link ad.
