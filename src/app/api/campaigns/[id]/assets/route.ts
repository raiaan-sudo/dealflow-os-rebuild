import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseFormDataBody,
} from "@/lib/api/route";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import {
  listCampaignCreativeAssets,
  uploadManualCreativeAsset,
} from "@/lib/services/creative-builder-service";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedContext();
    const { id } = await context.params;
    const campaignId = id?.trim();

    if (!campaignId) {
      throw new ApiError(400, "Campaign id is required.", "campaign_id_required");
    }

    const assets = await listCampaignCreativeAssets(campaignId, auth.userId);
    return apiSuccess(assets);
  } catch (error) {
    return handleApiError(error, "Campaign assets list");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const { id } = await context.params;
    const campaignId = id?.trim();

    if (!campaignId) {
      throw new ApiError(400, "Campaign id is required.", "campaign_id_required");
    }

    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "campaign-assets-upload", `${auth.organizationId}:${auth.userId}:${campaignId}`),
      limit: 12,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const formData = await parseFormDataBody(request, {
      maxBytes: 60 * 1024 * 1024,
      code: "asset_upload_body_too_large",
    });
    const file = formData.get("file");
    const kind = formData.get("kind");

    if (!(file instanceof File)) {
      throw new ApiError(400, "Media file is required.", "media_file_required");
    }

    const normalizedKind = kind === "video" || kind === "thumbnail" ? kind : "image";
    const maxBytes = normalizedKind === "video" ? 50 * 1024 * 1024 : 12 * 1024 * 1024;
    const allowedTypes =
      normalizedKind === "video"
        ? new Set(["video/mp4", "video/quicktime", "video/webm"])
        : new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

    if (file.size > maxBytes) {
      throw new ApiError(413, "Creative asset is too large.", "creative_asset_too_large");
    }

    if (file.type && !allowedTypes.has(file.type)) {
      throw new ApiError(415, "Creative asset type is not supported.", "creative_asset_type_unsupported");
    }

    const asset = await uploadManualCreativeAsset({
      campaignId,
      file,
      kind: normalizedKind,
      userId: auth.userId,
      label: typeof formData.get("label") === "string" ? (formData.get("label") as string) : null,
      caption: typeof formData.get("caption") === "string" ? (formData.get("caption") as string) : null,
    });

    return apiSuccess({ success: true, asset });
  } catch (error) {
    return handleApiError(error, "Campaign asset upload");
  }
}
