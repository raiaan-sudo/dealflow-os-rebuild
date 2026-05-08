import { ApiError } from "@/lib/api/route";
import { logError, logWarn } from "@/lib/logging";
import { NextResponse } from "next/server";

export type MetaErrorCategory =
  | "expired_token"
  | "missing_ad_account_permission"
  | "no_page_access"
  | "no_pixel_found"
  | "invalid_pixel"
  | "selected_asset_inaccessible"
  | "insufficient_business_permissions"
  | "ad_account_restricted"
  | "housing_category_required"
  | "meta_app_development_mode"
  | "timeout_or_rate_limit"
  | "oauth_cancelled"
  | "oauth_state_invalid"
  | "oauth_token_missing"
  | "workspace_context_missing"
  | "unknown_meta_failure";

export type MetaErrorContext =
  | "oauth_start"
  | "oauth_callback"
  | "asset_fetch"
  | "selection"
  | "preflight"
  | "launch"
  | "sync"
  | "status";

export type MetaErrorDiagnostic = {
  category: MetaErrorCategory;
  title: string;
  userMessage: string;
  recommendedAction: string;
  retryEligible: boolean;
  code: string;
  internalMessage: string;
};

type MetaErrorInput = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
  context: MetaErrorContext;
};

const CATEGORY_CONFIG: Record<
  MetaErrorCategory,
  Omit<MetaErrorDiagnostic, "category" | "internalMessage">
> = {
  expired_token: {
    code: "meta_expired_token",
    title: "Meta connection expired",
    userMessage: "Your Meta connection has expired.",
    recommendedAction: "Reconnect Meta, then try again.",
    retryEligible: true,
  },
  missing_ad_account_permission: {
    code: "meta_ad_account_permission_missing",
    title: "Meta ad account access needed",
    userMessage: "This Meta account cannot create ads in the selected ad account.",
    recommendedAction: "Use an ad account you can manage, or ask an admin to grant ad account access.",
    retryEligible: false,
  },
  no_page_access: {
    code: "meta_page_access_missing",
    title: "Facebook Page access needed",
    userMessage: "The selected Facebook Page is not available to this Meta connection.",
    recommendedAction: "Reconnect Meta with Page access, or choose a Page you can manage.",
    retryEligible: false,
  },
  no_pixel_found: {
    code: "meta_pixel_missing",
    title: "Meta pixel not found",
    userMessage: "No usable Meta pixel was found for the selected ad account.",
    recommendedAction: "Choose a different ad account or create a pixel in Meta before launching.",
    retryEligible: false,
  },
  invalid_pixel: {
    code: "meta_pixel_invalid",
    title: "Selected Meta pixel is invalid",
    userMessage: "The selected Meta pixel is no longer available for this ad account.",
    recommendedAction: "Choose a different pixel, then try again.",
    retryEligible: true,
  },
  selected_asset_inaccessible: {
    code: "meta_selected_asset_inaccessible",
    title: "Saved Meta selection is no longer available",
    userMessage: "One or more saved Meta selections are no longer accessible.",
    recommendedAction: "Re-select the ad account, Facebook Page, and pixel before launch.",
    retryEligible: true,
  },
  insufficient_business_permissions: {
    code: "meta_business_permissions_missing",
    title: "Meta business permissions needed",
    userMessage: "This Meta connection does not have the required business permissions.",
    recommendedAction: "Reconnect Meta with business access, or ask a business admin to grant access.",
    retryEligible: false,
  },
  ad_account_restricted: {
    code: "meta_ad_account_restricted",
    title: "Selected ad account is restricted",
    userMessage: "The selected Meta ad account is disabled or restricted.",
    recommendedAction: "Choose a different ad account, or fix the account restriction in Meta.",
    retryEligible: false,
  },
  housing_category_required: {
    code: "meta_housing_category_required",
    title: "Housing category setup required",
    userMessage: "Meta requires housing campaign settings before this campaign can launch.",
    recommendedAction: "Review the campaign settings and confirm the required housing category setup.",
    retryEligible: false,
  },
  meta_app_development_mode: {
    code: "meta_app_development_mode",
    title: "Meta app must be live",
    userMessage: "Meta blocked ad creative creation because the connected app is still in development mode.",
    recommendedAction: "Switch the Meta app to Live/Public mode in Meta for Developers, then retry launch.",
    retryEligible: false,
  },
  timeout_or_rate_limit: {
    code: "meta_timeout_or_rate_limit",
    title: "Meta is temporarily unavailable",
    userMessage: "Meta is slow or temporarily unavailable.",
    recommendedAction: "We retried automatically. Try again in a moment.",
    retryEligible: true,
  },
  oauth_cancelled: {
    code: "meta_oauth_cancelled",
    title: "Meta connection was cancelled",
    userMessage: "Meta connection was cancelled before it finished.",
    recommendedAction: "Start Meta connection again and approve the requested access.",
    retryEligible: true,
  },
  oauth_state_invalid: {
    code: "meta_oauth_state_invalid",
    title: "Meta connection could not be verified",
    userMessage: "This Meta connection attempt could not be verified safely.",
    recommendedAction: "Start the Meta connection again from the launch page.",
    retryEligible: true,
  },
  oauth_token_missing: {
    code: "meta_oauth_token_missing",
    title: "Meta did not return a usable connection token",
    userMessage: "Meta did not complete the connection successfully.",
    recommendedAction: "Reconnect Meta and try again.",
    retryEligible: true,
  },
  workspace_context_missing: {
    code: "meta_workspace_context_missing",
    title: "Workspace session missing",
    userMessage: "We could not match this Meta connection to your workspace.",
    recommendedAction: "Sign in again, then reconnect Meta from the launch page.",
    retryEligible: true,
  },
  unknown_meta_failure: {
    code: "meta_unknown_failure",
    title: "Meta request failed",
    userMessage: "Meta could not complete this step.",
    recommendedAction: "Try again. If it keeps failing, reconnect Meta and retry.",
    retryEligible: true,
  },
};

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function scrubMetaLogText(value: string | null | undefined) {
  const text = value?.trim();

  if (!text) {
    return null;
  }

  return text
    .replace(/\b(access_token|client_secret|appsecret_proof|code)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/https?:\/\/\S+/gi, "[url redacted]")
    .slice(0, 500);
}

function inferMetaErrorCategory(input: MetaErrorInput): MetaErrorCategory {
  const code = normalizeText(input.code);
  const message = normalizeText(input.message);

  if (
    code === "access_denied" ||
    code === "user_denied" ||
    message.includes("user denied") ||
    message.includes("cancelled")
  ) {
    return "oauth_cancelled";
  }

  if (code === "invalid_state") {
    return "oauth_state_invalid";
  }

  if (
    code === "no_token" ||
    message.includes("access token") && (message.includes("missing") || message.includes("empty"))
  ) {
    return "oauth_token_missing";
  }

  if (code === "supabase_unavailable" || code === "missing_workspace_context") {
    return "workspace_context_missing";
  }

  if (
    code === "meta_status_timeout" ||
    code === "meta_temporary_unavailable" ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("rate limit") ||
    message.includes("too many calls") ||
    message.includes("temporarily unavailable") ||
    message.includes("slow to respond") ||
    input.status === 429 ||
    input.status === 504
  ) {
    return "timeout_or_rate_limit";
  }

  if (
    message.includes("expired") ||
    message.includes("invalid oauth access token") ||
    message.includes("session has expired") ||
    code.includes("token")
  ) {
    return "expired_token";
  }

  if (
    code === "meta_ad_account_missing" ||
    code === "meta_account_invalid" ||
    code === "meta_ad_account_invalid" ||
    message.includes("ad account is not available") ||
    message.includes("ad account is not available for this connection") ||
    message.includes("selected meta ad account is not available")
  ) {
    return "selected_asset_inaccessible";
  }

  if (
    message.includes("account disabled") ||
    message.includes("account is disabled") ||
    message.includes("restricted") ||
    message.includes("account_status") ||
    code === "ad_account_disabled"
  ) {
    return "ad_account_restricted";
  }

  if (
    message.includes("ads_management") ||
    message.includes("manage campaigns") ||
    message.includes("ad account permission") ||
    message.includes("permission to access the ad account")
  ) {
    return "missing_ad_account_permission";
  }

  if (
    code === "meta_page_missing" ||
    code === "meta_page_invalid" ||
    message.includes("facebook page") ||
    message.includes("selected page") ||
    message.includes("page is not available")
  ) {
    return "no_page_access";
  }

  if (
    code === "meta_pixel_missing" ||
    message.includes("no usable meta pixel") ||
    message.includes("no pixel") ||
    message.includes("pixel discovery failed")
  ) {
    return "no_pixel_found";
  }

  if (
    code === "meta_pixel_invalid" ||
    message.includes("selected meta pixel") ||
    message.includes("pixel is not available")
  ) {
    return "invalid_pixel";
  }

  if (
    message.includes("business_management") ||
    message.includes("business permission") ||
    message.includes("business admin")
  ) {
    return "insufficient_business_permissions";
  }

  if (
    message.includes("development mode") ||
    message.includes("must be in public") ||
    message.includes("app is in development")
  ) {
    return "meta_app_development_mode";
  }

  if (
    message.includes("special ad category") ||
    message.includes("housing") ||
    code === "housing_category_required"
  ) {
    return "housing_category_required";
  }

  return "unknown_meta_failure";
}

export function mapMetaError(input: MetaErrorInput): MetaErrorDiagnostic {
  const category = inferMetaErrorCategory(input);
  const config = CATEGORY_CONFIG[category];
  const technical =
    input.message?.trim() ||
    input.code?.trim() ||
    `${input.context} failed without a specific Meta error message.`;

  return {
    category,
    ...config,
    internalMessage: technical,
  };
}

export function getMetaClientMessage(diagnostic: MetaErrorDiagnostic) {
  return `${diagnostic.userMessage} ${diagnostic.recommendedAction}`.trim();
}

export function getMetaClientPayload(
  diagnostic: MetaErrorDiagnostic,
  options?: { requestId?: string },
) {
  return {
    error: diagnostic.userMessage,
    action: diagnostic.recommendedAction,
    title: diagnostic.title,
    code: diagnostic.code,
    retryEligible: diagnostic.retryEligible,
    ...(options?.requestId ? { requestId: options.requestId } : {}),
  };
}

export function logMetaError(params: {
  context: MetaErrorContext;
  requestId: string;
  error: unknown;
  code?: string | null;
  message?: string | null;
  extra?: Record<string, unknown>;
}) {
  const diagnostic = mapMetaError({
    context: params.context,
    code: params.code,
    message:
      params.message ??
      (params.error instanceof Error ? params.error.message : typeof params.error === "string" ? params.error : null),
  });

  logError(`Meta ${params.context} failed`, {
    requestId: params.requestId,
    category: diagnostic.category,
    code: diagnostic.code,
    rawCode: scrubMetaLogText(params.code) ?? null,
    rawMessage: scrubMetaLogText(diagnostic.internalMessage),
    ...(params.extra ?? {}),
  });

  return diagnostic;
}

export function logMetaWarning(params: {
  context: MetaErrorContext;
  requestId: string;
  code?: string | null;
  message?: string | null;
  extra?: Record<string, unknown>;
}) {
  const diagnostic = mapMetaError({
    context: params.context,
    code: params.code,
    message: params.message,
  });

  logWarn(`Meta ${params.context} warning`, {
    requestId: params.requestId,
    category: diagnostic.category,
    code: diagnostic.code,
    rawCode: scrubMetaLogText(params.code) ?? null,
    rawMessage: scrubMetaLogText(diagnostic.internalMessage),
    ...(params.extra ?? {}),
  });

  return diagnostic;
}

export function createMetaApiError(
  context: MetaErrorContext,
  status: number,
  input: {
    code?: string | null;
    message?: string | null;
  },
) {
  const diagnostic = mapMetaError({
    context,
    code: input.code,
    message: input.message,
    status,
  });

  return new ApiError(status, getMetaClientMessage(diagnostic), diagnostic.code);
}

export function createMetaFailureResponse(params: {
  context: MetaErrorContext;
  status: number;
  requestId: string;
  error: unknown;
  code?: string | null;
  message?: string | null;
  extra?: Record<string, unknown>;
}) {
  const diagnostic = logMetaError({
    context: params.context,
    requestId: params.requestId,
    error: params.error,
    code: params.code,
    message: params.message,
    extra: params.extra,
  });

  return NextResponse.json(
    {
      error: diagnostic.userMessage,
      action: diagnostic.recommendedAction,
      title: diagnostic.title,
      code: diagnostic.code,
      retryEligible: diagnostic.retryEligible,
      requestId: params.requestId,
    },
    { status: params.status },
  );
}

export function getMetaQueryUiCopy(
  code: string | null | undefined,
  context: MetaErrorContext,
) {
  if (!code) {
    return null;
  }

  const diagnostic = mapMetaError({ code, context });
  return {
    title: diagnostic.title,
    message: diagnostic.userMessage,
    action: diagnostic.recommendedAction,
    retryEligible: diagnostic.retryEligible,
  };
}
