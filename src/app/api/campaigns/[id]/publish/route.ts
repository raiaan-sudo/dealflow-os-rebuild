import { z } from "zod";
import {
  apiSuccess,
  handleApiError,
  parseJsonBody,
  parseRouteParams,
} from "@/lib/api/route";
import { publishCampaignSchema } from "@/lib/schemas/api";
import { updateCampaignPublishState } from "@/lib/services/campaign-persistence";

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const payload = await parseJsonBody(request, publishCampaignSchema);
    const updated = await updateCampaignPublishState({
      campaignId: id,
      state: payload.state,
      slug: payload.slug ?? null,
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error, "Publish campaign");
  }
}
