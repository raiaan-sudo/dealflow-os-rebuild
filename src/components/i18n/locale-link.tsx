"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useProductLocale } from "@/components/i18n/product-locale-provider";
import { localizeProductHref } from "@/lib/i18n/routing";

type LocaleLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children: ReactNode;
    preserveLocale?: boolean;
  };

export function LocaleLink({
  href,
  prefetch = false,
  preserveLocale = true,
  ...props
}: LocaleLinkProps) {
  const locale = useProductLocale();
  const localizedHref =
    preserveLocale && typeof href === "string"
      ? localizeProductHref(href, locale)
      : href;

  // Authenticated routes read current tenant and provider state. Speculative
  // App Router prefetches add stale work and can be cancelled as the document
  // settles, so localized product navigation is demand-driven by default.
  return <Link href={localizedHref} prefetch={prefetch} {...props} />;
}
