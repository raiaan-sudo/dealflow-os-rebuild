"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Languages } from "lucide-react";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { PRODUCT_LOCALES } from "@/lib/i18n/config";
import { replaceProductLocaleInPathname } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale, t } = useProductI18n();
  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : "";

  return (
    <div
      aria-label={t("locale.switcher.aria")}
      className="flex items-center gap-1 rounded-2xl border border-white/8 bg-white/[0.04] p-1"
      role="group"
    >
      <Languages aria-hidden="true" className="mx-1 size-4 text-muted-foreground" />
      {PRODUCT_LOCALES.map((item) => (
        <Link
          key={item}
          aria-current={item === locale ? "page" : undefined}
          href={`${replaceProductLocaleInPathname(pathname, item)}${suffix}`}
          hrefLang={item}
          lang={item}
          prefetch={false}
          className={cn(
            "rounded-xl px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition",
            item === locale
              ? "bg-primary/12 text-primary"
              : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
          )}
        >
          {compact ? item : t(`locale.name.${item}`)}
        </Link>
      ))}
    </div>
  );
}
