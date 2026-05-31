import "server-only";
import { ApiError } from "@/lib/api/route";
import { isInternalAdminEmail } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/services/app-context";
import type { AppContext } from "@/types/app";
import type { PartnerMembershipRow, PartnerRole } from "@/lib/white-label/types";

const ADMIN_PARTNER_ROLES = new Set<PartnerRole>(["partner_admin"]);

export async function getCurrentUserContext() {
  const context = await getAppContext();
  if (!context) {
    throw new ApiError(401, "Authentication is required.", "unauthorized");
  }

  return context;
}

export async function requirePlatformAdmin() {
  const context = await getCurrentUserContext();
  const email = context.user.email ?? context.profile?.email ?? null;

  if (!isInternalAdminEmail(email)) {
    throw new ApiError(403, "Platform admin access is required.", "platform_admin_required");
  }

  return context;
}

export async function getPartnerMembership(
  context: AppContext,
  partnerId?: string | null,
): Promise<PartnerMembershipRow | null> {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  let query = admin
    .from("partner_memberships")
    .select("partner_id,user_id,role,status")
    .eq("user_id", context.user.id)
    .eq("status", "active")
    .limit(1);

  if (partnerId) {
    query = query.eq("partner_id", partnerId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new ApiError(500, error.message, "partner_membership_lookup_failed");
  }

  return (data as PartnerMembershipRow | null) ?? null;
}

export async function requirePartnerMembership(partnerId?: string | null) {
  const context = await getCurrentUserContext();
  const membership = await getPartnerMembership(context, partnerId);

  if (!membership) {
    throw new ApiError(403, "Partner membership is required.", "partner_membership_required");
  }

  return { context, membership };
}

export async function requirePartnerAdmin(partnerId?: string | null) {
  const scoped = await requirePartnerMembership(partnerId);

  if (!ADMIN_PARTNER_ROLES.has(scoped.membership.role)) {
    throw new ApiError(403, "Partner admin access is required.", "partner_admin_required");
  }

  return scoped;
}

export async function requireAccountAccess(accountId: string) {
  const context = await getCurrentUserContext();
  if (context.organization.id !== accountId) {
    throw new ApiError(403, "Account access is required.", "account_access_required");
  }

  return context;
}

export function scopeByPartner<T extends { partner_id?: string | null }>(
  rows: T[],
  partnerId: string | null,
) {
  return rows.filter((row) => row.partner_id === partnerId);
}

export function scopeByAccount<T extends { organization_id?: string | null; account_id?: string | null }>(
  rows: T[],
  accountId: string,
) {
  return rows.filter((row) => row.organization_id === accountId || row.account_id === accountId);
}
