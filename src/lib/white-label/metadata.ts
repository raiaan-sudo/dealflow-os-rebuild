import type { Metadata } from "next";
import type { PartnerContext } from "@/lib/white-label/types";

const NATIVE_DESCRIPTION =
  "Build, preview, and launch real estate campaigns without the agency drag.";

type PartnerMetadataOptions = {
  title?: string;
  description?: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
};

export function buildPartnerPageMetadata(
  partnerContext: PartnerContext,
  options: PartnerMetadataOptions = {},
): Metadata {
  const fallbackTitle = options.fallbackTitle ?? "DealFlow OS";
  const fallbackDescription = options.fallbackDescription ?? NATIVE_DESCRIPTION;

  if (partnerContext.nativeFallback || partnerContext.partnerStatus !== "active") {
    return {
      title: fallbackTitle,
      description: fallbackDescription,
      openGraph: {
        title: fallbackTitle,
        description: fallbackDescription,
      },
      twitter: {
        title: fallbackTitle,
        description: fallbackDescription,
      },
    };
  }

  const brandName = partnerContext.branding.brandName;
  const title = options.title ?? `${brandName} Launch Portal`;
  const description = options.description ?? partnerContext.branding.loginHeadline;

  return {
    title: {
      absolute: title,
    },
    description,
    openGraph: {
      title,
      description,
    },
    twitter: {
      title,
      description,
    },
  };
}
