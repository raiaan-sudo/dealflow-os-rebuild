import { ApiError, assertSameOriginRequest, handleApiError } from "@/lib/api/route";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    await getAuthenticatedContext();
    throw new ApiError(
      503,
      "Video generation is disabled until HeyGen credentials and launch limits are confirmed.",
      "video_generation_disabled",
    );
  } catch (error) {
    return handleApiError(error, "Generate video");
  }
}
