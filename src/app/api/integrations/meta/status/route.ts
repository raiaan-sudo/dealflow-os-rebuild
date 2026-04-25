import { apiSuccess, handleApiError, retryRouteStep, withRouteTimeout } from "@/lib/api/route";
import { validateMetaEnv } from "@/lib/env";
import {
  getDefaultMetaConnectionState,
  getMetaConnectionState,
} from "@/lib/integrations/meta/service";

function buildMetaStatusPayload() {
  const validation = validateMetaEnv();
  const connection = getDefaultMetaConnectionState();

  return {
    connection,
    configured: validation.configured,
    oauthConfigured: validation.configured,
    tracking: connection.tracking,
    error: validation.configured
      ? null
      : `Meta connection is not configured yet. Missing: ${validation.missing.join(", ")}.`,
  };
}

export async function GET() {
  try {
    const validation = validateMetaEnv();
    const connection = await withRouteTimeout(
      retryRouteStep(() => getMetaConnectionState(), { retries: 1, delayMs: 300 }),
      {
        timeoutMs: 8_000,
        message: "Meta status check timed out.",
        code: "meta_status_timeout",
        status: 504,
      },
    );
    return apiSuccess({
      connection,
      configured: validation.configured,
      oauthConfigured: validation.configured,
      tracking: connection.tracking,
      error: validation.configured
        ? null
        : `Meta connection is not configured yet. Missing: ${validation.missing.join(", ")}.`,
    });
  } catch (error) {
    if (!validateMetaEnv().configured) {
      return apiSuccess(buildMetaStatusPayload());
    }

    return handleApiError(error, "Meta status request");
  }
}
