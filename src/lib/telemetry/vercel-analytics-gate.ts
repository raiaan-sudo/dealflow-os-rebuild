import "server-only";

import {
  readVercelAnalyticsAuthority,
} from "@/lib/authority/owner-decision-authority";
import type {
  OwnerDecisionAuthorityResult,
} from "@/lib/authority/owner-decision-authority-contract";

/**
 * Vercel Analytics is a privacy-sensitive production telemetry surface. Host,
 * environment, or credential presence can never enable it. The exact hosted
 * production identity and the candidate-bound, externally signed owner/legal
 * authority packet must both authorize the capability.
 */
export async function shouldRenderVercelAnalytics(
  env: Record<string, string | undefined> = process.env,
  authority?: OwnerDecisionAuthorityResult,
) {
  const resolvedAuthority = authority ?? await readVercelAnalyticsAuthority();
  return env.VERCEL === "1" &&
    env.VERCEL_ENV === "production" &&
    env.DEALFLOW_DEPLOYMENT_TARGET === "production" &&
    resolvedAuthority.authorized === true &&
    resolvedAuthority.authorityMode === "production" &&
    resolvedAuthority.capability === "vercel_analytics";
}
