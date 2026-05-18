# Public Self-Serve Signup And Preview Handoff - 2026-05-18

## Scope

This handoff closes the acceptance gaps found during the fresh-customer pass:

- `/signup` must not return a 404.
- App navigation must not touch provider-generation endpoints before an explicit user action.
- Preview must render a safe review state for fresh campaigns without launch-ready media.
- Launch gates must continue to block until real selected launch-ready media exists.

## Manual Public Signup Proof

Turnstile and email confirmation are real production controls. Do not bypass them with an owner session, admin-created user, service-role session, auth harness, or disabled challenge.

Owner/manual steps:

1. Open `https://app.agentdealflow.io/signup` or `https://app.agentdealflow.io/login?mode=sign-up`.
2. Create a brand-new non-owner customer account with an inbox the owner controls.
3. Complete the Cloudflare Turnstile challenge in the browser.
4. Confirm the email from the real inbox if Supabase email confirmation is required.
5. Log in as that same fresh customer.
6. Hand the authenticated browser session back to Codex for post-owner verification.

Codex post-owner verification:

1. Confirm the account email is not in internal admin or billing override allowlists.
2. Confirm the account is not using an owner/admin session.
3. Verify onboarding, paywall, builder, Creative Intake, Preview, Launch, Settings, Support, and Dashboard on desktop and 390px mobile.
4. Confirm no Stripe checkout, Meta launch, lead submission, SMS/email send, provider generation, or Freshdesk ticket occurs during proof.
5. Confirm Preview can render the review-only state and Launch still reports the missing saved creative set until real launch-ready media is selected.

## Acceptance Rules

- `/signup` is a public convenience route that redirects to canonical `/login?mode=sign-up`.
- Creative Intake and app navigation may save/approve a brief only after an explicit user action.
- Static or video provider generation may start only from an explicit generation/render action after route-side gates pass.
- Review-only preview placeholders are for layout and message-match acceptance only.
- Review-only placeholders are not selected media, are not launch-ready, cannot satisfy the static creative minimum, and cannot unlock Meta launch.

## Safety Boundaries

Do not create Stripe charges or checkout sessions, launch or mutate Meta ads, submit real leads, send SMS/email, trigger provider generation, create Freshdesk tickets, expose secrets, bypass Turnstile/email confirmation, or delete production data.
