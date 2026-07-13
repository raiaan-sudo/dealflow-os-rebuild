"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import type { ProductMessageKey } from "@/lib/i18n/messages";
import { parseProductLocalePathname } from "@/lib/i18n/routing";

type StatusTone = "calm" | "active";

function getStatusForPath(
  pathname: string,
  t: (key: ProductMessageKey) => string,
) {
  if (pathname.startsWith("/launching")) {
    return {
      label: t("launch.campaignStatus"),
      title: t("launch.schedule"),
      description: t("launch.metaMayChange"),
      tone: "active" as StatusTone,
    };
  }

  if (pathname.startsWith("/launch")) {
    return {
      label: t("launch.campaignStatus"),
      title: t("launch.finalReview"),
      description: t("launch.metaMayChange"),
      tone: "active" as StatusTone,
    };
  }

  if (pathname.startsWith("/integrations")) {
    return {
      label: t("common.status"),
      title: t("launch.metaSetup"),
      description: t("launch.precheck"),
      tone: "active" as StatusTone,
    };
  }

  if (pathname.startsWith("/onboarding")) {
    return {
      label: t("common.status"),
      title: t("onboarding.currentStep"),
      description: t("onboarding.ready"),
      tone: "calm" as StatusTone,
    };
  }

  if (pathname.startsWith("/dashboard")) {
    return {
      label: t("launch.campaignStatus"),
      title: t("dashboard.title"),
      description: t("dashboard.description"),
      tone: "calm" as StatusTone,
    };
  }

  return {
    label: t("common.status"),
    title: t("shell.workspace"),
    description: t("shell.pathHelp"),
    tone: "calm" as StatusTone,
  };
}

export function SystemStatus() {
  const pathname = parseProductLocalePathname(usePathname()).pathname;
  const { t } = useProductI18n();
  const status = useMemo(() => getStatusForPath(pathname, t), [pathname, t]);

  return (
    <div
      className={[
        "rounded-[24px] border px-5 py-4",
        status.tone === "active"
          ? "border-primary/15 bg-primary/[0.05]"
          : "border-white/8 bg-white/[0.03]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
            status.tone === "active" ? "bg-primary" : "bg-white/35",
          ].join(" ")}
        />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {status.label}
          </p>
          <p className="mt-2 text-sm font-semibold text-white">{status.title}</p>
          <p className="mt-1 text-xs leading-6 text-white/58">{status.description}</p>
        </div>
      </div>
    </div>
  );
}
