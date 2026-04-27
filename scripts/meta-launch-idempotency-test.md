# Meta Launch Idempotency Test

This validates that interrupted Meta launches can be retried without creating duplicate campaigns, ad sets, creatives, or ads.

## Preconditions

- Use a staging workspace with a real Meta ad account, Page, and pixel.
- Ensure the campaign has completed:
  - onboarding
  - funnel generation
  - creative generation
  - campaign payload build
  - selected ad save
- Set `ENABLE_META_LAUNCH_TEST_MODE=true` in the staging environment if `NODE_ENV=production`.

## Important

- Do not run this in a live client workspace.
- Use a fresh campaign for each interruption scenario.

## Scenario 1: Interrupt after campaign creation

1. Open the campaign launch flow and confirm Meta preflight passes.
2. Send:

```bash
curl -X POST \
  "http://localhost:3000/api/campaigns/<campaign-id>/launch" \
  -H "Content-Type: application/json" \
  --data '{"test_mode_interrupt_after":"campaign"}'
```

3. Confirm the route fails with a forced interruption error.
4. Inspect `campaign_plans.plan.launch_runtime`:
   - `campaign_id` exists
   - `adset_id`, `creative_id`, `ad_id` are still null
   - `current_stage` is `campaign`
   - `status` is `failed`
5. Retry launch normally:

```bash
curl -X POST \
  "http://localhost:3000/api/campaigns/<campaign-id>/launch" \
  -H "Content-Type: application/json" \
  --data '{}'
```

6. Confirm:
   - no second Meta campaign is created
   - existing campaign is validated and reused
   - launch continues with ad set creation

## Scenario 2: Interrupt after ad set creation

1. Use a new campaign.
2. Send:

```bash
curl -X POST \
  "http://localhost:3000/api/campaigns/<campaign-id>/launch" \
  -H "Content-Type: application/json" \
  --data '{"test_mode_interrupt_after":"ad_set"}'
```

3. Confirm `campaign_id` and `adset_id` are saved in `launch_runtime`.
4. Retry launch normally.
5. Confirm:
   - no duplicate campaign is created
   - no duplicate ad set is created
   - launch resumes at creative creation

## Scenario 3: Interrupt after creative creation

1. Use a new campaign.
2. Send:

```bash
curl -X POST \
  "http://localhost:3000/api/campaigns/<campaign-id>/launch" \
  -H "Content-Type: application/json" \
  --data '{"test_mode_interrupt_after":"creative"}'
```

3. Confirm `campaign_id`, `adset_id`, and `creative_id` are saved in `launch_runtime`.
4. Retry launch normally.
5. Confirm:
   - no duplicate campaign is created
   - no duplicate ad set is created
   - no duplicate creative is created
   - launch resumes at ad creation

## DB validation checklist

For each scenario, confirm `campaign_plans.plan.launch_runtime` contains:

- `campaign_id`
- `adset_id`
- `creative_id`
- `ad_id`
- `current_stage`
- `status`
- `step_status`
- `attempt_id`
- `requested_object_type`
- `requested_object_name`
- `requested_object_key`
- `workspace_id`

## Meta validation checklist

For each retry:

- Campaign name matches deterministic naming convention.
- Ad set name matches deterministic naming convention.
- Creative name matches deterministic naming convention.
- Ad name matches deterministic naming convention.
- Retry does not create a second object with the same deterministic suffix.

## Pass criteria

- Retry reuses any already-created valid object.
- Missing or deleted objects are recreated one step at a time.
- Completed objects are not duplicated.
- User-visible error stage matches the failing stage.
