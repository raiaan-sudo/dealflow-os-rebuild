"use client";

import { useEffect } from "react";
import {
  normalizePublicFunnelLanguage,
  type PublicFunnelLanguage,
} from "@/lib/public-funnel-language";

export function PublicFunnelDocumentLanguage({
  language,
}: {
  language: PublicFunnelLanguage;
}) {
  useEffect(() => {
    const previousLanguage = document.documentElement.lang || "en";
    const normalizedLanguage = normalizePublicFunnelLanguage(language);
    document.documentElement.lang = normalizedLanguage;

    return () => {
      document.documentElement.lang = previousLanguage;
    };
  }, [language]);

  return null;
}
