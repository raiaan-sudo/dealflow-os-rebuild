import { z } from "zod";
import { NextResponse } from "next/server";
import { handleApiError, parseRouteParams } from "@/lib/api/route";
import { getCampaignById } from "@/lib/services/campaign-persistence";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await parseRouteParams(params, paramsSchema);
    const campaign = await getCampaignById(id);

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found.", code: "campaign_not_found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    return handleApiError(error, "Campaign");
  }
}
