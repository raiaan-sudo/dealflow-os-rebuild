# Final Owner Walkthrough Prompt

## Goal

Run a final owner/business acceptance walkthrough without broad remediation or unsafe side effects.

## Safety Rules

- Do not launch Meta ads.
- Do not create Stripe charges.
- Do not submit leads.
- Do not send SMS/email.
- Do not trigger provider generation.
- Do not mutate production DB data.
- Keep owner/manual acceptance separate from technical readiness.

## Walkthrough Scope

- Production homepage and login.
- Authenticated dashboard.
- Build / Creative Studio.
- Preview.
- Launch gates.
- Funnel URL `/f/raiaan-broker-toronto-on-ccbfbfce`.
- Billing/Stripe status visibility.
- Meta selections/status visibility.
- Support/cancellation surfaces if in scope.

## Required Report

- What is technically ready.
- What still needs owner acceptance.
- What would block live launch.
- What is cosmetic or post-launch.
- Readiness percentages.
- GO/NO-GO for controlled beta and public self-serve.
