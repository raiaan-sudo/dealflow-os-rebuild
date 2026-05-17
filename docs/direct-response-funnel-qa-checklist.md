# Direct-Response Funnel QA Checklist

Use this checklist for funnel V1 docs and smoke-test verification. Keep checks read-only unless a separate task explicitly authorizes a production mutation.

## Static Checks

- Run `npm run smoke:offline`.
- Confirm the V1 10 variant list is documented and still maps to the engine-created sections.
- Confirm form-above-fold support is present in both preview and public route source markers.
- Confirm proof/how-it-works/FAQ/compliance coverage:
  - `proof_metrics` exists and is titled `Proof before commitment`.
  - `process` exists and is titled `How the mechanism works`.
  - `faq` exists and is titled `Questions prospects ask before converting`.
  - Public form copy includes SMS consent, privacy, and terms language.
- Confirm `/f/raiaan-realty` redirects before public campaign lookup.
- Confirm stale snapshot protections are present in launch UI and direct launch route.
- Confirm campaign 345 repair protections stay covered by `scripts/test-campaign-345-state-repair.mjs`.

## Manual Browser QA

Only run manual browser QA against local or explicitly approved read-only targets.

- Load a published funnel and confirm the first viewport contains the headline, subheadline, CTA, and lead form.
- Verify mobile stacking does not hide the form behind all proof sections.
- Verify proof, how-it-works, FAQ, and consent/legal copy are visible or reachable.
- Do not submit real leads.
- Do not send SMS/email.
- Do not click paid, launch, provider, Stripe, Meta, or Freshdesk actions.

## Pass Criteria

- `npm run smoke:offline` passes.
- `git diff --check` passes.
- The changed docs describe the current source contract and do not claim production proof, deployment, live Meta activation, billing acceptance, or provider execution.
