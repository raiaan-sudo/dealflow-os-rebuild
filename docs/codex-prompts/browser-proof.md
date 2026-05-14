# Browser Proof Prompt

## Goal

Run authenticated browser proof for the named DealFlow flow and campaign. Browser proof must verify the actual customer/operator UI, not only local data.

## Safety Rules

- Do not click launch, checkout, send, submit lead, SMS, email, or provider generation actions unless the prompt explicitly authorizes them.
- Use QA/auth harnesses safely.
- Do not expose emails, cookies, tokens, or screenshots containing secrets.
- Do not mutate unrelated campaigns.

## Required Checks

- Desktop viewport.
- Mobile 390px viewport.
- No hydration errors.
- No horizontal overflow.
- Expected readiness text/state.
- No forbidden raw media actions.
- For media: Build / Preview / Launch agreement.
- For video: custom customer player or `controls=false`; no native download controls.

## Final Report Format

- Pages visited.
- Viewports.
- Auth method used, without secret values.
- Pass/fail per page.
- Console/page errors.
- Screenshots/artifacts path if created.
- Remaining UI blockers.
