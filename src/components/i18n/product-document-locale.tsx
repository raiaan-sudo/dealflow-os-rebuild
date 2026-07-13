"use client";

import { useEffect } from "react";
import { normalizeProductLocale } from "@/lib/i18n/config";

export function ProductDocumentLocale({ locale }: { locale: unknown }) {
  useEffect(() => {
    const documentElement = document.documentElement;
    const previousLanguage = documentElement.lang;
    const normalizedLocale = normalizeProductLocale(locale);
    documentElement.lang = normalizedLocale;
    documentElement.dataset.productLocale = normalizedLocale;

    return () => {
      documentElement.lang = previousLanguage || "en";
      delete documentElement.dataset.productLocale;
    };
  }, [locale]);

  return null;
}
