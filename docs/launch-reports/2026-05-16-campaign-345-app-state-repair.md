# Campaign 345 App-State Repair - 2026-05-16

## Verdict

Campaign `345dcc04-8e87-4ead-b71a-40236e2ef52e` had a real app-state gap: the public funnel and paused Meta objects existed, but the authenticated campaign document still showed no saved selected-media set and no saved paused launch runtime.

Codex performed a narrowly scoped production repair against only that campaign row after a dry-run verified owner/org context, existing app-owned launch-ready media, and read-only paused Meta IDs. No Meta, Stripe, lead, SMS/email, provider, Freshdesk, or unrelated campaign side effect was performed.

Live paid launch remains **NO-GO** until the owner resolves the Meta funds warning and explicitly approves live-spend activation.

## Dry-Run Evidence

- Target campaign: `345dcc04-8e87-4ead-b71a-40236e2ef52e`
- Owner/org verified:
  - `owner_id`: `8b82dea3-54da-4ccb-accc-81931513436c`
  - `organization_id`: `8b82dea3-54da-4ccb-accc-81931513436c`
  - `user_id`: `ddaff253-807d-419e-8411-7b276558f05e`
- Before selected static IDs: `[]`
- Before selected UGC/video IDs: `[]`
- Before runtime:
  - `launch_status`: `built`
  - `runtime.status`: `built`
  - `runtime.safetyState`: `ready`
  - `runtime.campaignId`: `null`
  - `runtime.adSetId`: `null`
  - `runtime.adId`: `null`
  - `launch_runtime.campaign_id`: `null`

## Repair Applied

The repair wrote only `campaign_plans.plan` and `campaign_plans.launch_status` for campaign 345.

After selected static IDs:

- `static-ugc-proof`
- `static-ugc-walkthrough`
- `static-buyer-affordability-reality-check`
- `static-buyer-early-access-homes`

After selected UGC/video IDs:

- `video-ugc-launch-15s-1778801411705`

After paused runtime:

- `launch_status`: `paused`
- `runtime.status`: `paused`
- `runtime.safetyState`: `paused`
- `runtime.launchMode`: `live`
- `runtime.campaignId`: `120248208607670616`
- `runtime.adSetId`: `120248208608400616`
- `runtime.adId`: `120248208609740616`
- `runtime.metaPushStatus`: `paused`
- `runtime.metaAdSetIds`: `["120248208608400616"]`
- `runtime.metaAdIds`: `["120248208609740616"]`
- `runtime.budgetDailyInput`: `3`
- `launch_runtime.status`: `paused`
- `launch_runtime.step_status`: `paused`
- `launch_runtime.campaign_id`: `120248208607670616`
- `launch_runtime.adset_id`: `120248208608400616`
- `launch_runtime.creative_id`: `1387185106767238`
- `launch_runtime.ad_id`: `120248208609740616`

The post-apply verification returned `idempotentNoop: true`.

## Media Evidence

Launch-ready static groups:

- `static-buyer-affordability-reality-check`
- `static-buyer-early-access-homes`
- `static-ugc-proof`
- `static-ugc-walkthrough`

Non-selected static groups stayed excluded:

- `static-problem-solution`: blocked by `quality_gate_not_accepted`
- `static-buyer-curated-match-list`: blocked by `quality_gate_not_accepted`

Launch-ready UGC video:

- `video-ugc-launch-15s-1778801411705`: app-owned file, normalized storage, 15.07s duration, source static `static-ugc-proof`

Non-selected videos stayed excluded:

- `video-ugc`: blocked by `sample_or_template_video`
- `video-ugc-final`: blocked by `missing_video_duration_metadata`

## Read-Only Meta Evidence

- Campaign `120248208607670616`: `PAUSED`
- Ad set `120248208608400616`: `PAUSED`, `daily_budget=300`
- Ad `120248208609740616`: `PAUSED`
- Creative `1387185106767238`: linked to `https://app.agentdealflow.io/f/raiaan-realty`
- Tracking/domain context: selected Meta account connected, pixel present, `launch_domain=app.agentdealflow.io`, `domain_verified=true`

## Public Funnel Boundary

The production funnel path remains safe:

- `https://app.agentdealflow.io/f/raiaan-realty` redirects to `/f/raiaan-broker-toronto-on-ccbfbfce`
- `https://app.agentdealflow.io/f/raiaan-broker-toronto-on-ccbfbfce` returns `200`

The canonical slug `raiaan-broker-toronto-on-ccbfbfce` is already owned by a separate published public-funnel row. The repair therefore did **not** mutate `campaign_plans.public_slug` on campaign 345. The app-state repair is limited to selected media and paused runtime state.

## Rollback

Rollback scope is exactly one row: `campaign_plans.id = 345dcc04-8e87-4ead-b71a-40236e2ef52e`.

Rollback procedure:

1. Restore `campaign_plans.plan` for campaign 345 from the pre-repair snapshot emitted by `scripts/repair-campaign-345-launch-state.mjs`.
2. Restore `campaign_plans.launch_status` from `paused` to `built`.
3. Do not touch Meta objects, public funnel rows, unrelated campaigns, Stripe, leads, SMS/email, providers, or Freshdesk.

## Owner-Only Blockers

1. Resolve the Meta funds warning.
2. Give explicit live-spend activation approval.
3. Provide `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY` later if live Freshdesk ticket creation is required.
