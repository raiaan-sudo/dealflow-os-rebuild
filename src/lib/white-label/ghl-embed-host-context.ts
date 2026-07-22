import { isGhlEmbedCapabilityEnabled } from "./ghl-embed-capability";
import {
  loadVerifiedPartnerDomainContext,
  normalizePartnerDomainHost,
} from "./verified-partner-domain";

export type GhlEmbedHostContext = {
  domain: string;
  partnerId: string | null;
  tenantKind: "direct_realtor" | "partner_child";
};

function configuredDirectAppHost() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? process.env.APP_URL?.trim() ?? "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/") {
      return null;
    }
    return normalizePartnerDomainHost(url.hostname);
  } catch {
    return null;
  }
}

/**
 * Resolves either a verified white-label partner host or the one exact
 * configured first-party DealFlow app host. The latter is required for direct
 * realtor workspaces, whose partner id is intentionally null.
 */
export async function resolveGhlEmbedHostContext(
  rawHost: string | null | undefined,
): Promise<GhlEmbedHostContext | null> {
  if (!isGhlEmbedCapabilityEnabled()) return null;
  const domain = normalizePartnerDomainHost(rawHost);
  if (!domain) return null;

  const partner = await loadVerifiedPartnerDomainContext(domain);
  if (partner) {
    return {
      domain: partner.domain,
      partnerId: partner.partnerId,
      tenantKind: "partner_child",
    };
  }

  return configuredDirectAppHost() === domain
    ? { domain, partnerId: null, tenantKind: "direct_realtor" }
    : null;
}
