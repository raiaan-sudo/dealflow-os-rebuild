import { isExplicitNonProductionDeployment } from "@/lib/deployment-target";

/**
 * Vercel Analytics is a production telemetry surface. Isolated staging,
 * previews, local development, and tests must not load its script or emit
 * telemetry. Unknown hosted production remains unchanged until the protected
 * production trust root can classify it more precisely.
 */
export function shouldRenderVercelAnalytics(
  env: Record<string, string | undefined> = process.env,
) {
  return env.VERCEL === "1" && !isExplicitNonProductionDeployment(env);
}
