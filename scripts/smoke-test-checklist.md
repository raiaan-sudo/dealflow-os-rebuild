# Dealflow OS Rebuild Smoke Test Checklist

Developer-only manual checklist for live validation. Do not automate ad spend from this file.

## Preconditions

- Use a real user account with valid access to the target workspace.
- Use a real Meta Ads account, Facebook Page, and pixel that are safe to test with.
- Use a deployed environment with a public app URL, not localhost.
- Keep Ads Manager open during the launch steps.

## Checklist

1. Log in with a real account.
   - Confirm authentication succeeds.
   - Confirm post-login redirect lands on the intended route.

2. Submit onboarding twice with the same inputs.
   - Use the exact same business type, location, service, and budget.
   - Confirm the second submission returns the same `campaignId`.

3. Complete the funnel, creative, and campaign build flow.
   - Confirm funnel generation succeeds.
   - Confirm creative generation succeeds.
   - Confirm campaign payload build succeeds.

4. Select a non-recommended ad on the creatives step.
   - Do not choose the recommended/top-scored ad.
   - Confirm the selection saves successfully.

5. Confirm `/preview` and `/launch` show the same selected ad.
   - Verify headline, body, and image match exactly.
   - Confirm launch is not previewing a recommended fallback.

6. Connect Meta and explicitly select ad account, Page, and pixel.
   - Confirm the selected values are saved.
   - Confirm the dashboard later shows the same selected assets.

7. Invalidate one Meta asset and confirm launch blocks.
   - Remove access to the selected account, Page, or pixel, or select an invalid test asset.
   - Confirm preflight blocks launch with a clear error.

8. Restore valid Meta assets and launch again.
   - Confirm launch preflight passes.
   - Confirm launch starts normally.

9. Refresh mid-launch after campaign creation and after ad set creation.
   - Confirm the flow resumes from saved DB state.
   - Confirm it does not recreate already-created Meta objects.

10. Confirm Meta objects in Ads Manager.
   - Verify campaign exists.
   - Verify ad set exists.
   - Verify creative exists.
   - Verify ad exists.

11. Confirm the destination URL is `/f/[slug]`, not `/preview`.
   - Inspect the ad in Ads Manager.
   - Confirm the landing URL is the public funnel route.

12. Open `/f/[slug]` while logged out.
   - Confirm the page loads without authentication.

13. Submit an email-only lead.
   - Confirm submission succeeds.
   - Confirm the lead is saved with campaign and organization linkage.

14. Submit a phone-only lead.
   - Confirm submission succeeds.
   - Confirm the lead is saved with campaign and organization linkage.

15. Confirm the dashboard updates.
   - Confirm leads appear for the same campaign.
   - Confirm the lead loop shows verified.
   - Confirm Meta status, launch status, selected assets, and recommendation labels remain truthful.

## Pass Criteria

- No duplicate campaign plans are created from duplicate onboarding submissions.
- No duplicate Meta objects are created after mid-launch refresh/retry.
- The launched ad matches the selected ad from creatives and preview.
- The ad points to the public funnel URL only.
- Both email-only and phone-only lead submissions succeed.
- The dashboard reflects the saved campaign state and verified lead loop accurately.
