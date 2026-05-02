import { ApiError, apiSuccess, assertSameOriginRequest, handleApiError } from "@/lib/api/route";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import {
  deleteCreativeAssetById,
  getCreativeAssetById,
} from "@/lib/services/creative-builder-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedContext();
    const { id } = await context.params;
    const assetId = id?.trim();

    if (!assetId) {
      throw new ApiError(400, "Asset id is required.", "asset_id_required");
    }

    const asset = await getCreativeAssetById(assetId, auth.userId);

    if (!asset) {
      throw new ApiError(404, "Creative asset not found.", "asset_not_found");
    }

    return apiSuccess(asset);
  } catch (error) {
    return handleApiError(error, "Creative asset fetch");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const { id } = await context.params;
    const assetId = id?.trim();

    if (!assetId) {
      throw new ApiError(400, "Asset id is required.", "asset_id_required");
    }

    const result = await deleteCreativeAssetById(assetId, auth.userId);
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error, "Creative asset delete");
  }
}
