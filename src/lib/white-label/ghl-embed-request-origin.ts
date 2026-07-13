import { normalizePartnerDomainHost } from "./verified-partner-domain";

type VerifiedPartnerRequestOriginInput = {
  requestUrl: string;
  origin: string | null;
  referer: string | null;
  fetchSite: string | null;
  partnerDomain: string;
  requireHttps: boolean;
};

export function isExactVerifiedPartnerRequestOrigin(
  input: VerifiedPartnerRequestOriginInput,
) {
  try {
    const requestUrl = new URL(input.requestUrl);
    const partnerDomain = normalizePartnerDomainHost(input.partnerDomain);
    const origin = input.origin?.trim() ?? "";
    const referer = input.referer?.trim() ?? "";
    const fetchSite = input.fetchSite?.trim().toLowerCase() ?? "";
    if (
      !partnerDomain ||
      requestUrl.hostname.toLowerCase() !== partnerDomain ||
      (input.requireHttps && requestUrl.protocol !== "https:") ||
      !origin ||
      new URL(origin).origin !== requestUrl.origin ||
      origin !== requestUrl.origin ||
      (referer && new URL(referer).origin !== requestUrl.origin) ||
      (fetchSite && fetchSite !== "same-origin")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
