import { ApiError } from "@/lib/api/route";

const REQUIRED_CREATIVE_ASSET_VIDEO_COLUMNS = [
  "provider_asset_id",
  "file_url",
  "thumbnail_url",
  "type",
] as const;

type ErrorLike = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function toCombinedErrorText(error: unknown) {
  if (!error || typeof error !== "object") {
    return safeText(error);
  }

  const record = error as ErrorLike;

  return [record.message, record.details, record.hint, record.code]
    .map(safeText)
    .filter(Boolean)
    .join(" ");
}

export function getCreativeAssetsSchemaCompatibilityMessage(
  error: unknown,
  operation: string,
) {
  const errorText = toCombinedErrorText(error).toLowerCase();

  if (!errorText.includes("creative_assets")) {
    return null;
  }

  const isSchemaError =
    errorText.includes("schema cache") ||
    errorText.includes("could not find the") ||
    errorText.includes("column") ||
    errorText.includes("pgrst204") ||
    errorText.includes("42703");

  if (!isSchemaError) {
    return null;
  }

  return [
    `Video generation cannot ${operation} because the creative_assets table is missing required video columns.`,
    `Required columns: ${REQUIRED_CREATIVE_ASSET_VIDEO_COLUMNS.join(", ")}.`,
    "Apply the creative asset migrations or add those columns in Supabase, then try again.",
  ].join(" ");
}

export function toVideoProviderApiError(error: unknown, operation: "start" | "check") {
  const message =
    error instanceof Error ? error.message : safeText(error) || "AI video provider request failed.";
  const normalized = message.toLowerCase();

  if (normalized.includes("higgsfield") || normalized.includes("hf_credentials")) {
    return new ApiError(
      503,
      "AI video generation is not configured. Confirm the media provider credentials are set before generating videos.",
      "video_provider_config_missing",
    );
  }

  if (normalized.includes("missing heygen_api_key")) {
    return new ApiError(
      503,
      "AI video generation is not configured. Add video provider credentials before generating videos.",
      "video_provider_config_missing",
    );
  }

  if (normalized.includes("heygen_api_key appears masked or incomplete")) {
    return new ApiError(
      503,
      "AI video provider credentials are incomplete. Add the full live credentials, then restart the app.",
      "video_provider_config_missing",
    );
  }

  if (normalized.includes("unauthorized")) {
    return new ApiError(
      502,
      "The AI video provider rejected the request. Confirm the full live credentials are configured before generating videos.",
      operation === "start" ? "video_provider_request_failed" : "video_provider_status_failed",
    );
  }

  if (normalized.includes("avatar_id") || normalized.includes("no heygen avatar")) {
    return new ApiError(
      503,
      "AI video creator setup is incomplete. Add a valid creator/avatar configuration before generating videos.",
      "video_provider_avatar_missing",
    );
  }

  if (normalized.includes("voice_id") || normalized.includes("no heygen voice")) {
    return new ApiError(
      503,
      "AI video voice setup is incomplete. Add a valid voice configuration before generating videos.",
      "video_provider_voice_missing",
    );
  }

  return new ApiError(
    502,
    operation === "start"
      ? `The AI video provider could not start the video job. ${message}`
      : `The AI video provider could not return the video status. ${message}`,
    operation === "start" ? "video_provider_request_failed" : "video_provider_status_failed",
  );
}

export function formatVideoWorkflowErrorMessage(input: {
  error?: string | null;
  code?: string | null;
}) {
  const error = safeText(input.error);
  const code = safeText(input.code);

  if (code === "creative_assets_schema_incompatible") {
    return (
      error ||
      "Video storage is not fully set up. Apply the creative_assets migrations in Supabase and try again."
    );
  }

  if (code === "video_provider_config_missing") {
    return error || "AI video generation is not configured yet.";
  }

  if (code === "video_provider_avatar_missing" || code === "video_provider_voice_missing") {
    return error || "AI video creator or voice setup is incomplete.";
  }

  if (code === "video_provider_request_failed" || code === "video_provider_status_failed") {
    return error || "The video provider failed to respond cleanly.";
  }

  return error || "Video generation failed.";
}
