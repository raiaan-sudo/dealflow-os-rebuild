import "server-only";
import { logWarn } from "@/lib/logging";
import type { Database } from "@/lib/supabase/types";
import { normalizePartnerSlug } from "@/lib/white-label/branding";
import type { PartnerAttributionSource, PartnerContext, PartnerRow } from "@/lib/white-label/types";

type SupabaseLike = {
  from: (table: string) => any;
};

type AttributionParams = {
  supabase: SupabaseLike;
  user: {
    id: string;
    user_metadata?: Record<string, unknown>;
  };
  organization: {
    id: string;
  };
};

function isMissingWhiteLabelSchema(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "42P01" || code === "42703" || /partner|partner_id/i.test(message);
}

function metadataText(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function findExistingPartnerAccount(supabase: SupabaseLike, organizationId: string) {
  const { data, error } = await supabase
    .from("partner_accounts")
    .select("partner_id,attribution_source,attribution_detail,partners(*)")
    .eq("account_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  return data as {
    partner_id?: string | null;
    attribution_source?: PartnerAttributionSource | null;
    attribution_detail?: string | null;
    partners?: PartnerRow | PartnerRow[] | null;
  } | null;
}

async function findActivePartnerFromOrganization(supabase: SupabaseLike, organizationId: string) {
  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("partner_id")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError) throw organizationError;

  const partnerId = typeof organization?.partner_id === "string" && organization.partner_id.trim()
    ? organization.partner_id.trim()
    : null;

  if (!partnerId) {
    return null;
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id,status")
    .eq("id", partnerId)
    .maybeSingle();

  if (partnerError) throw partnerError;

  return partner?.id && partner.status === "active" ? partner.id as string : null;
}

async function findPartnerFromInvite(supabase: SupabaseLike, inviteCode: string) {
  const { data, error } = await supabase
    .from("partner_invites")
    .select("code,status,max_uses,use_count,expires_at,partners(*)")
    .eq("code", inviteCode)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  const invite = data as {
    code?: string | null;
    max_uses?: number | null;
    use_count?: number | null;
    expires_at?: string | null;
    partners?: PartnerRow | PartnerRow[] | null;
  } | null;
  const partner = Array.isArray(invite?.partners) ? invite?.partners[0] : invite?.partners;
  const expired = invite?.expires_at ? Date.parse(invite.expires_at) < Date.now() : false;
  const overused = typeof invite?.max_uses === "number" && (invite.use_count ?? 0) >= invite.max_uses;
  if (!partner || partner.status !== "active" || expired || overused) {
    return null;
  }

  return { partner, attributionSource: "invite" as const, attributionDetail: inviteCode };
}

async function findPartnerFromSlug(supabase: SupabaseLike, slugValue: string) {
  const slug = normalizePartnerSlug(slugValue);
  if (!slug) return null;

  const { data, error } = await supabase
    .from("partners")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  const partner = data as PartnerRow | null;
  return partner ? { partner, attributionSource: "slug" as const, attributionDetail: slug } : null;
}

export async function ensurePartnerAttributionForWorkspace({
  supabase,
  user,
  organization,
}: AttributionParams): Promise<PartnerContext["partnerId"]> {
  try {
    const existing = await findExistingPartnerAccount(supabase, organization.id);
    const existingPartner = Array.isArray(existing?.partners) ? existing?.partners[0] : existing?.partners;
    if (existing?.partner_id) {
      await Promise.all([
        supabase.from("organizations").update({ partner_id: existing.partner_id } satisfies Database["public"]["Tables"][string]["Update"]).eq("id", organization.id),
        supabase.from("users").update({ partner_id: existing.partner_id } satisfies Database["public"]["Tables"][string]["Update"]).eq("id", user.id),
      ]);
      return existingPartner?.id ?? existing.partner_id;
    }

    const organizationPartnerId = await findActivePartnerFromOrganization(supabase, organization.id);
    if (organizationPartnerId) {
      await Promise.all([
        supabase.from("partner_accounts").upsert(
          {
            partner_id: organizationPartnerId,
            account_id: organization.id,
            user_id: user.id,
            attribution_source: "admin",
            attribution_detail: "organization.partner_id",
            locked: true,
          },
          { onConflict: "account_id" },
        ),
        supabase.from("users").update({ partner_id: organizationPartnerId } satisfies Database["public"]["Tables"][string]["Update"]).eq("id", user.id),
      ]);
      return organizationPartnerId;
    }

    const inviteCode = metadataText(user.user_metadata, "partner_invite_code");
    const partnerSlug = metadataText(user.user_metadata, "partner_slug");
    const attribution =
      inviteCode
        ? await findPartnerFromInvite(supabase, inviteCode)
        : partnerSlug
          ? await findPartnerFromSlug(supabase, partnerSlug)
          : null;

    if (!attribution?.partner?.id) {
      return null;
    }

    const partnerId = attribution.partner.id;
    await supabase.from("partner_accounts").upsert(
      {
        partner_id: partnerId,
        account_id: organization.id,
        user_id: user.id,
        attribution_source: attribution.attributionSource,
        attribution_detail: attribution.attributionDetail,
        locked: true,
      },
      { onConflict: "account_id" },
    );
    await Promise.all([
      supabase.from("organizations").update({ partner_id: partnerId }).eq("id", organization.id),
      supabase.from("users").update({ partner_id: partnerId }).eq("id", user.id),
    ]);

    if (attribution.attributionSource === "invite" && attribution.attributionDetail) {
      await supabase
        .from("partner_invites")
        .update({
          used_at: new Date().toISOString(),
          used_by_user_id: user.id,
        })
        .eq("code", attribution.attributionDetail);
    }

    return partnerId;
  } catch (error) {
    if (!isMissingWhiteLabelSchema(error)) {
      logWarn("Partner attribution skipped", {
        userId: user.id,
        organizationId: organization.id,
        message: error instanceof Error ? error.message : "Unknown partner attribution error",
      });
    }

    return null;
  }
}
