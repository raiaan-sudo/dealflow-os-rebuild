"use client";

import { usePathname } from "next/navigation";
import { ChevronRight, BarChart3, Eye, Headphones, PanelLeft, Rocket, Wand2 } from "lucide-react";
import { adminNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/ui/logo";
import type { CampaignExperienceStage } from "@/lib/services/campaign-plan-service";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { parseProductLocalePathname } from "@/lib/i18n/routing";

type AppSidebarProps = {
  organizationName: string;
  isAdmin: boolean;
  stage: CampaignExperienceStage;
  productName?: string;
  brandName?: string;
  brandPrimaryColor?: string;
  isWhiteLabel?: boolean;
  poweredByDealFlow?: boolean;
};

export function AppSidebar({
  organizationName,
  isAdmin,
  stage,
  productName = "DealFlow AI",
  brandName = "DealFlow",
  brandPrimaryColor = "#67e8f9",
  isWhiteLabel = false,
  poweredByDealFlow = false,
}: AppSidebarProps) {
  const pathname = parseProductLocalePathname(usePathname()).pathname;
  const { t } = useProductI18n();
  const stageLabel =
    stage === "draft" || stage === "built" || stage === "paywall"
      ? t("stage.build")
      : stage === "preview"
        ? t("stage.review")
        : stage === "launch_ready" || stage === "launching"
          ? t("stage.goLive")
          : t("stage.results");
  const productNavigation = [
    { href: "/onboarding", label: t("nav.build"), icon: Wand2 },
    { href: "/preview", label: t("nav.review"), icon: Eye },
    { href: "/launch", label: t("nav.goLive"), icon: Rocket },
    { href: "/dashboard", label: t("nav.results"), icon: BarChart3 },
    { href: "/support", label: t("nav.support"), icon: Headphones },
  ];

  return (
    <aside className="hidden h-screen w-[232px] shrink-0 lg:flex xl:w-[244px]">
      <div className="flex h-full w-full flex-col border-r border-white/6 bg-[linear-gradient(180deg,rgba(5,8,14,0.92),rgba(6,10,17,0.72))] px-3.5 py-4 backdrop-blur-2xl">
        <div className="surface-strong rounded-[22px] px-3.5 py-3.5">
          <div className="flex items-center gap-3">
            {isWhiteLabel ? (
              <div
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-white/[0.05] text-sm font-semibold"
                style={{ borderColor: brandPrimaryColor, color: brandPrimaryColor }}
              >
                {brandName.slice(0, 1).toUpperCase()}
              </div>
            ) : (
              <Logo size="small" iconOnly priority className="shrink-0" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-[-0.02em]">{productName}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {stageLabel}
              </p>
            </div>
          </div>
          {isWhiteLabel && poweredByDealFlow ? (
            <p className="mt-2 px-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("shell.poweredBy")}
            </p>
          ) : null}
          <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(188,236,255,0.08)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {t("shell.workspace")}
            </p>
            <div className="mt-2 space-y-2">
              <p className="min-w-0 text-sm font-medium leading-6">{organizationName}</p>
              <Badge className="w-fit shrink-0 border-primary/20 bg-primary/10 text-primary">{t("shell.aiLive")}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {t("shell.product")}
          </p>
          <nav className="mt-3 space-y-1.5">
            {productNavigation.map((item) => {
              const isActive =
                item.href === "/onboarding"
                  ? pathname.startsWith("/onboarding") || pathname.startsWith("/build")
                  : item.href === "/launch"
                  ? pathname.startsWith("/launch") || pathname.startsWith("/integrations") || pathname.startsWith("/campaign")
                  : item.href === "/dashboard"
                    ? pathname.startsWith("/dashboard")
                  : pathname === item.href || pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition",
                    isActive
                      ? "surface-strong border border-primary/15 text-foreground shadow-[0_18px_48px_-34px_rgba(108,184,255,0.45)]"
                      : "border border-transparent text-muted-foreground hover:border-primary/10 hover:bg-primary/[0.04] hover:text-foreground",
                  )}
                  href={item.href}
                >
                  <div
                    className={cn(
                      "flex size-8.5 items-center justify-center rounded-xl border text-muted-foreground transition",
                      isActive
                        ? "border-primary/25 bg-primary/12 text-primary"
                        : "border-white/8 bg-white/[0.03] group-hover:border-white/12 group-hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <span className="flex-1 font-medium">{item.label}</span>
                  <ChevronRight
                    className={cn(
                      "size-4 transition",
                      isActive ? "text-primary" : "text-transparent group-hover:text-muted-foreground",
                    )}
                  />
                </Link>
              );
            })}
          </nav>
        </div>

        {isAdmin ? (
          <div className="mt-6">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {t("shell.internal")}
            </p>
            <nav className="mt-3 space-y-1.5">
              {adminNavigation.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition",
                      isActive
                        ? "surface-strong border border-white/10 text-foreground"
                        : "border border-transparent text-muted-foreground hover:border-white/8 hover:bg-white/[0.04] hover:text-foreground",
                    )}
                    href={item.href}
                  >
                    <div
                      className={cn(
                        "flex size-8.5 items-center justify-center rounded-xl border transition",
                        isActive
                          ? "border-primary/25 bg-primary/12 text-primary"
                          : "border-white/8 bg-white/[0.03] text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <span className="flex-1 font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : null}

        <div className="surface-subtle mt-auto rounded-[22px] p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-white/[0.05]">
              <PanelLeft className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t("shell.nextStep")}</p>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{stageLabel}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-white/66">
            {t("shell.pathHelp")}
          </p>
        </div>
      </div>
    </aside>
  );
}
