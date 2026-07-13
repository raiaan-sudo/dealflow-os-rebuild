import { handleApiError } from "@/lib/api/route";
import { downloadVerifiedCreativeImage } from "@/lib/creative-content-integrity";
import { verifyHiggsfieldSourceProxyRequest } from "@/lib/services/higgsfield-source-proxy";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await context.params;
    const identity = verifyHiggsfieldSourceProxyRequest({
      assetId,
      url: new URL(request.url),
    });
    if (!identity) {
      return Response.json({ error: "Source creative not found." }, { status: 404 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return Response.json({ error: "Source creative unavailable." }, { status: 503 });
    }
    const [{ data: asset, error: assetError }, { data: campaign, error: campaignError }, { data: dispatch, error: dispatchError }] =
      await Promise.all([
        (admin as any)
          .from("creative_assets")
          .select("id,user_id,campaign_id,provider_name,status,file_url,paid_creative_dispatch_id")
          .eq("id", identity.assetId)
          .eq("user_id", identity.userId)
          .eq("campaign_id", identity.campaignId)
          .eq("provider_name", "openai")
          .eq("status", "ready")
          .eq("paid_creative_dispatch_id", identity.dispatchId)
          .maybeSingle(),
        (admin as any)
          .from("campaign_plans")
          .select("id")
          .eq("id", identity.campaignId)
          .eq("organization_id", identity.organizationId)
          .eq("user_id", identity.userId)
          .maybeSingle(),
        (admin as any)
          .from("paid_creative_dispatches")
          .select("id")
          .eq("id", identity.dispatchId)
          .eq("organization_id", identity.organizationId)
          .eq("user_id", identity.userId)
          .eq("campaign_id", identity.campaignId)
          .eq("provider", "openai")
          .eq("operation", "openai_image_generation")
          .eq("state", "projected")
          .maybeSingle(),
      ]);
    if (assetError || campaignError || dispatchError) {
      return Response.json({ error: "Source creative unavailable." }, { status: 503 });
    }
    if (
      !asset ||
      !campaign ||
      !dispatch ||
      typeof asset.file_url !== "string" ||
      !asset.file_url.trim()
    ) {
      return Response.json({ error: "Source creative not found." }, { status: 404 });
    }

    const image = await downloadVerifiedCreativeImage(asset.file_url);
    const extension = image.contentType === "image/png"
      ? "png"
      : image.contentType === "image/jpeg"
        ? "jpg"
        : "webp";
    return new Response(Uint8Array.from(image.bytes).buffer, {
      status: 200,
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.bytes.byteLength),
        "Content-Disposition": `inline; filename="higgsfield-source.${extension}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-DealFlow-Content-SHA256": image.sha256,
      },
    });
  } catch (error) {
    return handleApiError(error, "Higgsfield source creative");
  }
}
