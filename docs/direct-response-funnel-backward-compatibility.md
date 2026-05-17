# Direct-Response Funnel Backward Compatibility Notes

This note records public-funnel compatibility rules that matter for existing links, paused launch state, and launch safety.

## Legacy Slug Redirect

`/f/raiaan-realty` is a legacy paid alias used by campaign 345 evidence and paused Meta destination records. The public route must redirect that alias to `/f/raiaan-broker-toronto-on-ccbfbfce` before calling `getPublishedCampaignBySlug`.

This protects already-created paused Meta destinations while preserving the current owner-accepted canonical proof URL.

## Stale Snapshot Protection

The direct launch route must not send traffic to an outdated public funnel. It must:

- Load `public_slug`, `publish_state`, and `published_snapshot` from `campaign_plans`.
- Require the public funnel to be published.
- Compare the current plan signature with the published snapshot signature.
- Throw `published_funnel_snapshot_stale` before Meta preflight or Meta object creation when signatures differ.

The launch UI must show stale public funnel state as blocked and tell the operator to republish before sending paid traffic.

## Campaign 345 Repair Protections

Campaign 345 repair tooling must remain narrow and explicit:

- The repair target is only campaign `345dcc04-8e87-4ead-b71a-40236e2ef52e`.
- Apply mode requires `CAMPAIGN_345_REPAIR_APPLY=repair-campaign-345-paused-launch-state`.
- Static media selection requires at least four launch-ready static groups.
- UGC selection uses only launch-ready UGC videos tied to accepted static assets.
- The repair preserves the published funnel snapshot by copying it into the repaired plan.
- The public route redirect must preempt campaign lookup so a restored row-level alias cannot hijack `/f/raiaan-realty`.

Do not touch Meta objects, Stripe, provider jobs, Freshdesk, leads, SMS/email, unrelated campaigns, or production data unless a later owner-approved task explicitly authorizes that exact action.
