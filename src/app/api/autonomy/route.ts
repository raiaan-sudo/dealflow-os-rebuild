import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/route";
import { evaluateAutonomy } from "@/app/api/autonomy/_shared";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    const result = await evaluateAutonomy(campaignId);

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Autonomy");
  }
}
