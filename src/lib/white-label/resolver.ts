import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPartnerBranding, normalizePartnerDomain, normalizePartnerSlug, normalizeSupportMode, normalizeVerticalKey } from "@/lib/white-label/branding";
import { NATIVE_PARTNER_CONTEXT, type PartnerAttributionSource, type PartnerContext, type PartnerResolutionInput, type PartnerRow } from "@/lib/white-label/types";

type PartnerLookup = {
  partner: PartnerRow;
  branding: Record<string, unknown> | null;
  support: Record<string, unknown> | null;
  vertical: Record<string, unknown> | null;
  attributionSource: PartnerAttributionSource;
  attributionDetail: string | null;
  verifiedDomain: boolean;
};

function isMissingWhiteLabelTable(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "42P01" || /relation .*partner|column .*partner_id/i.test(message);
}

function currentFeatureFlagEnabled() {
  return process.env.WHITE_LABEL_ENABLED !== "false";
}

function normalizePathPart(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function extractPartnerRouteParams(pathname: string | null | undefined) {
  const path = normalizePathPart(pathname) ?? "/";
  const partnerMatch = path.match(/^\/p\/([^/]+)(?:\/(start|invite)\/?([^/]+)?)?/);
  if (!partnerMatch) {
    const inviteMatch = path.match(/^\/invite\/([^/]+)/);
    return {
      partnerSlug: null,
      inviteCode: inviteMatch?.[1] ?? null,
    };
  }

  return {
    partnerSlug: partnerMatch[1] ?? null,
    inviteCode: partnerMatch[2] === "invite" ? partnerMatch[3] ?? null : null,
  };
}

async function fetchBrandingBundle(partnerId: string) {
  const admin = createAdminClient();
  if (!admin) {
    return { branding: null, support: null, vertical: null };
  }

  const [brandingResult, supportResult, verticalResult] = await Promise.all([
    admin.from("partner_branding").select("*").eq("partner_id", partnerId).maybeSingle(),
    admin.from("partner_support_settings").select("*").eq("partner_id", partnerId).maybeSingle(),
    admin.from("partner_vertical_configs").select("*").eq("partner_id", partnerId).eq("status", "active").limit(1).maybeSingle(),
  ]);

  return {
    branding: (brandingResult.data as Record<string, unknown> | null) ?? null,
    support: (supportResult.data as Record<string, unknown> | null) ?? null,
    vertical: (verticalResult.data as Record<string, unknown> | null) ?? null,
  };
}

async function findPartnerByVerifiedDomain(hostname: string | null): Promise<PartnerLookup | null> {
  const domain = normalizePartnerDomain(hostname);
  const admin = createAdminClient();
  if (!domain || !admin) {
    return null;
  }

  const { data, error } = await admin
    .from("partner_domains")
    .select("partner_id,domain,type,verification_status,partners(*)")
    .eq("domain", domain)
    .eq("verification_status", "verified")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    if (isMissingWhiteLabelTable(error)) return null;
    throw error;
  }

  const partner = (data as { partners?: PartnerRow | PartnerRow[] | null } | null)?.partners;
  const partnerRow = Array.isArray(partner) ? partner[0] : partner;
  if (!partnerRow || partnerRow.status !== "active") {
    return null;
  }

  const bundle = await fetchBrandingBundle(partnerRow.id);
  return {
    partner: partnerRow,
    ...bundle,
    attributionSource: "domain",
    attributionDetail: domain,
    verifiedDomain: true,
  };
}

async function findPartnerBySlug(slugInput: string | null | undefined): Promise<PartnerLookup | null> {
  const slug = normalizePartnerSlug(slugInput);
  const admin = createAdminClient();
  if (!slug || !admin) {
    return null;
  }

  const { data, error } = await admin
    .from("partners")
    .select("*")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    if (isMissingWhiteLabelTable(error)) return null;
    throw error;
  }

  const partner = data as PartnerRow | null;
  if (!partner || partner.status !== "active") {
    return null;
  }

  const bundle = await fetchBrandingBundle(partner.id);
  return {
    partner,
    ...bundle,
    attributionSource: "slug",
    attributionDetail: slug,
    verifiedDomain: false,
  };
}

async function findPartnerByInvite(inviteCodeInput: string | null | undefined): Promise<PartnerLookup | null> {
  const inviteCode = normalizePathPart(inviteCodeInput);
  const admin = createAdminClient();
  if (!inviteCode || !admin) {
    return null;
  }

  const { data, error } = await admin
    .from("partner_invites")
    .select("code,status,max_uses,use_count,expires_at,partners(*)")
    .eq("code", inviteCode)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    if (isMissingWhiteLabelTable(error)) return null;
    throw error;
  }

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

  const bundle = await fetchBrandingBundle(partner.id);
  return {
    partner,
    ...bundle,
    attributionSource: "invite",
    attributionDetail: inviteCode,
    verifiedDomain: false,
  };
}

export async function isInviteUsableForPartner(partnerId: string, inviteCodeInput: string | null | undefined) {
  const inviteCode = normalizePathPart(inviteCodeInput);
  const admin = createAdminClient();
  if (!inviteCode || !admin) {
    return false;
  }

  const { data, error } = await admin
    .from("partner_invites")
    .select("code,status,max_uses,use_count,expires_at,partner_id")
    .eq("code", inviteCode)
    .eq("partner_id", partnerId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    if (isMissingWhiteLabelTable(error)) return false;
    throw error;
  }

  const invite = data as {
    max_uses?: number | null;
    use_count?: number | null;
    expires_at?: string | null;
  } | null;
  const expired = invite?.expires_at ? Date.parse(invite.expires_at) < Date.now() : false;
  const overused = typeof invite?.max_uses === "number" && (invite.use_count ?? 0) >= invite.max_uses;
  return Boolean(invite) && !expired && !overused;
}

function lookupToContext(lookup: PartnerLookup | null): PartnerContext {
  if (!lookup) {
    return NATIVE_PARTNER_CONTEXT;
  }

  return {
    partnerId: lookup.partner.id,
    partnerSlug: lookup.partner.slug,
    partnerStatus: lookup.partner.status ?? "draft",
    branding: buildPartnerBranding({
      partner: lookup.partner,
      brandingRow: lookup.branding,
      supportRow: lookup.support,
    }),
    supportMode: normalizeSupportMode(lookup.support?.support_mode),
    verticalKey: normalizeVerticalKey(lookup.vertical?.vertical_key),
    attributionSource: lookup.attributionSource,
    attributionDetail: lookup.attributionDetail,
    verifiedDomain: lookup.verifiedDomain,
    nativeFallback: false,
  };
}

export async function resolvePartnerContext(input: PartnerResolutionInput): Promise<PartnerContext> {
  if (!currentFeatureFlagEnabled()) {
    return NATIVE_PARTNER_CONTEXT;
  }

  const routeParams = extractPartnerRouteParams(input.pathname);
  const hostname = normalizePartnerDomain(input.hostname);
  const inviteCode = input.inviteCode ?? routeParams.inviteCode;
  const partnerSlug = input.partnerSlug ?? routeParams.partnerSlug;

  const byInvite = await findPartnerByInvite(inviteCode);
  if (byInvite) {
    const normalizedSlug = normalizePartnerSlug(partnerSlug);
    if (!normalizedSlug || byInvite.partner.slug === normalizedSlug) {
      return lookupToContext(byInvite);
    }
    return NATIVE_PARTNER_CONTEXT;
  }

  const byDomain = await findPartnerByVerifiedDomain(hostname);
  if (byDomain) return lookupToContext(byDomain);

  const bySlug = await findPartnerBySlug(partnerSlug);
  if (bySlug) return lookupToContext(bySlug);

  return NATIVE_PARTNER_CONTEXT;
}

export async function resolvePartnerContextFromHeaders() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const pathname = headerStore.get("x-pathname");
  return resolvePartnerContext({ hostname: host, pathname });
}

export async function resolvePartnerContextBySlug(partnerSlug: string, inviteCode?: string | null) {
  return resolvePartnerContext({ partnerSlug, inviteCode });
}
