# Production Proof Checklist

Use this checklist before claiming a DealFlow production deployment, launch path, or authenticated UI state is ready.

## Deployment Identity

- Verify deployment ID.
- Verify deployment ready state.
- Verify deployed commit or clean worktree source.
- Do not assume local build equals production.
- Do not assume a previous alias still points to the intended deployment.

## Alias Verification

- `https://app.agentdealflow.io`
- `https://agentdealflow.io`
- `https://www.agentdealflow.io`

Record status codes, redirects, and final host behavior.

## Accepted Funnel URL

- Current accepted proof funnel: `/f/raiaan-broker-toronto-on-ccbfbfce`.
- `/f/raiaan-realty` is not a blocker unless owner reclassifies it.

## Safe GET Probes

- `/`
- `/login`
- `/privacy`
- `/terms`
- `/data-deletion`
- `/dashboard` unauthenticated redirect
- `/f/raiaan-broker-toronto-on-ccbfbfce`
- `/robots.txt`
- `/sitemap.xml`
- `/opengraph-image`

## Invalid Or Unsigned POST Probes

- Invalid `POST /api/lead-capture` should fail validation.
- Unsigned `POST /api/stripe/webhook` should fail signature validation.
- Unsigned `POST /api/webhooks/twilio/status` should fail Twilio signature validation.
- Unauthenticated `/api/internal/system-jobs` should fail authorization.

Do not submit real lead data. Do not create checkout sessions. Do not send SMS. Do not launch Meta ads.

## Security Headers

Verify:

- CSP present.
- HSTS present.
- X-Frame-Options present.
- X-Content-Type-Options `nosniff`.
- Referrer-Policy present.

## Authenticated Production Browser Proof

Run when claiming production UI readiness:

- Build / Creative Studio.
- Preview.
- Launch.
- Desktop viewport.
- Mobile 390px viewport.
- No hydration errors.
- No horizontal overflow.
- Correct customer-safe media player.
- No Download / Export / Copy URL / Open original actions.

## Build / Preview / Launch Agreement

For creative media readiness:

- Build shows selected launch-ready static state.
- Preview shows the same static readiness.
- Launch gate agrees with Build and Preview.
- UGC video appears ready only if app-owned video storage and QA/provenance pass.
- Review/sample video warnings must not appear for final launch-ready media.

## Screenshot And State Expectations

Capture or record:

- URL.
- Viewport.
- Visible readiness text.
- Video element state when relevant.
- Console/page errors.
- Overflow result.
- Any blocked launch reason.

## Anti-False-Pass Rules

- No local-only PASS claims for production readiness.
- No stale deployment/cache assumptions.
- No cross-campaign proof confusion.
- No screenshots from a different campaign.
- No DB row from one campaign used to justify another campaign.
- No `operator:debt` warnings ignored.
