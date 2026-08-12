import { ApiError, apiSuccess, retryRouteStep, withRouteTimeout } from "@/lib/api/route";
import { validateMetaEnv } from "@/lib/env";
import { createMetaFailureResponse } from "@/lib/integrations/meta/error-mapper";
import {
  getDefaultMetaConnectionState,
  getMetaConnectionState,
} from "@/lib/integrations/meta/service";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { isMetaProviderIncluded } from "@/lib/release/approved-launch-profile";

export const dynamic = "force-dynamic";

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
  const requestId = crypto.randomUUID();
  try {
    await getAuthenticatedContext();

    if (!isMetaProviderIncluded()) {
      return apiSuccess({
        connection: getDefaultMetaConnectionState(),
        configured: false,
        oauthConfigured: false,
        tracking: getDefaultMetaConnectionState().tracking,
        error: "Meta is not included in this release.",
      });
    }

    const validation = validateMetaEnv();
    const connection = await withRouteTimeout(
      (signal) =>
        retryRouteStep(() => getMetaConnectionState({ signal }), {
          retries: 1,
          delayMs: 300,
          shouldRetry: (error) => signal.aborted === false && (
            error instanceof ApiError
              ? error.status === 408 || error.status === 429 || error.status >= 500
              : error instanceof Error
                ? error.name === "TypeError"
                : false
          ),
        }),
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
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return createMetaFailureResponse({
        context: "status",
        status: error.status,
        requestId,
        error,
      });
    }

    if (!validateMetaEnv().configured) {
      return apiSuccess(buildMetaStatusPayload());
    }

    return createMetaFailureResponse({
      context: "status",
      status: error instanceof ApiError ? error.status : 503,
      requestId,
      error,
    });
  }
}
