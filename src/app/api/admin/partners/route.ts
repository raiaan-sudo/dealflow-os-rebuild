import { z } from "zod";
import { ApiError, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePartnerSlug } from "@/lib/white-label/branding";
import { requirePlatformAdmin } from "@/lib/white-label/permissions";

const partnerCreateSchema = z.object({
  slug: z.string().min(2).max(64),
  brandName: z.string().min(2).max(120),
  legalName: z.string().max(160).optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  faviconUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i).default("#67e8f9"),
  secondaryColor: z.string().regex(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i).optional().nullable(),
  accentColor: z.string().regex(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i).optional().nullable(),
  supportEmail: z.string().email().optional().nullable(),
  supportPhone: z.string().max(40).optional().nullable(),
  defaultTimezone: z.string().min(2).max(80).default("America/Toronto"),
  commissionRate: z.number().min(0).max(1).default(0),
  status: z.enum(["draft", "active", "paused", "archived"]).default("draft"),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const context = await requirePlatformAdmin();
    const admin = createAdminClient();
    if (!admin) {
      throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
    }

    const body = await parseJsonBody(request, partnerCreateSchema);
    const slug = normalizePartnerSlug(body.slug);
    if (!slug) {
      throw new ApiError(400, "Partner slug is invalid.", "partner_slug_invalid");
    }

    const { data: partner, error } = await admin
      .from("partners")
      .insert({
        slug,
        brand_name: body.brandName,
        legal_name: body.legalName ?? null,
        logo_url: body.logoUrl ?? null,
        favicon_url: body.faviconUrl ?? null,
        primary_color: body.primaryColor,
        secondary_color: body.secondaryColor ?? null,
        accent_color: body.accentColor ?? null,
        support_email: body.supportEmail ?? null,
        support_phone: body.supportPhone ?? null,
        default_timezone: body.defaultTimezone,
        commission_rate: body.commissionRate,
        status: body.status,
        created_by: context.user.id,
        updated_by: context.user.id,
      } as never)
      .select("id,slug,brand_name,status")
      .single();

    if (error) {
      throw new ApiError(500, error.message, "partner_create_failed");
    }

    await admin.from("partner_audit_logs").insert({
      partner_id: (partner as { id?: string } | null)?.id ?? null,
      actor_user_id: context.user.id,
      actor_role: "platform_admin",
      action: "partner_created",
      target_type: "partner",
      target_id: (partner as { id?: string } | null)?.id ?? null,
      metadata_json: {
        slug,
        status: body.status,
      },
      user_agent: request.headers.get("user-agent"),
    } as never);

    return Response.json({ success: true, partner });
  } catch (error) {
    return handleApiError(error, "Admin partner create");
  }
}
