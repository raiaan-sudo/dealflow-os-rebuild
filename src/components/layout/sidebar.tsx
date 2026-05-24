"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, BarChart3, Eye, PanelLeft, Rocket, Wand2 } from "lucide-react";
import { adminNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/ui/logo";
import type { CampaignExperienceStage } from "@/lib/services/campaign-plan-service";

type AppSidebarProps = {
  organizationName: string;
  isAdmin: boolean;
  stage: CampaignExperienceStage;
  activeCampaignId?: string | null;
};

function buildCampaignScopedHref(path: string, campaignId?: string | null) {
  if (!campaignId) {
    return path;
  }

  const params = new URLSearchParams();
  params.set("campaignId", campaignId);
  return `${path}?${params.toString()}`;
}

export function AppSidebar({ organizationName, isAdmin, stage, activeCampaignId }: AppSidebarProps) {
  const pathname = usePathname();
  const campaignId = activeCampaignId ?? null;
  const stageState: Record<CampaignExperienceStage, { label: string; copy: string }> = {
    draft: { label: "Build", copy: "Complete setup and generate the campaign." },
    built: { label: "Build", copy: "Tune the campaign, then review the preview." },
    paywall: { label: "Build", copy: "Unlock the campaign to continue review." },
    preview: { label: "Review", copy: "Check the preview and confirm launch details." },
    launch_ready: { label: "Launch", copy: "Review paused setup and owner activation gates." },
    launching: { label: "Paused setup", copy: "Meta object recovery is running; delivery stays paused." },
    live: { label: "Results", copy: "Track synced delivery after owner activation." },
  };
  const stageLabel = stageState[stage].label;
  const productNavigation = [
    { href: "/builder", label: "Build", icon: Wand2 },
    { href: "/preview", label: "Review", icon: Eye },
    { href: "/launch", label: "Launch", icon: Rocket },
    { href: "/dashboard", label: "Results", icon: BarChart3 },
  ];

  return (
    <aside className="hidden h-screen w-[216px] shrink-0 lg:flex xl:w-[228px]">
      <div className="flex h-full w-full flex-col overflow-hidden border-r border-white/6 bg-[linear-gradient(180deg,rgba(5,8,14,0.92),rgba(6,10,17,0.72))] px-3 py-3.5 backdrop-blur-2xl">
        <div className="surface-strong rounded-[18px] px-3 py-3">
          <div className="flex items-center gap-2.5">
            <Logo size="small" iconOnly priority className="shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-[-0.02em]">DealFlow</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {stageLabel}
              </p>
            </div>
          </div>
          <div className="mt-2.5 rounded-xl border border-white/8 bg-black/20 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(188,236,255,0.08)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Workspace
            </p>
            <div className="mt-1.5 space-y-1.5">
              <p className="min-w-0 truncate text-sm font-medium leading-5" title={organizationName}>
                {organizationName}
              </p>
              <Badge className="w-fit shrink-0 border-primary/20 bg-primary/10 text-primary">AI workspace</Badge>
            </div>
          </div>
        </div>

        <div className="mt-5 min-w-0">
          <p className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Product
          </p>
          <nav className="mt-2 space-y-1">
            {productNavigation.map((item) => {
              const isActive =
                item.href === "/builder"
                  ? pathname.startsWith("/builder") || pathname.startsWith("/build")
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
                    "group flex min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition",
                    isActive
                      ? "surface-strong border border-primary/15 text-foreground shadow-[0_18px_48px_-34px_rgba(108,184,255,0.45)]"
                      : "border border-transparent text-muted-foreground hover:border-primary/10 hover:bg-primary/[0.04] hover:text-foreground",
                  )}
                  href={buildCampaignScopedHref(item.href, campaignId)}
                >
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition",
                      isActive
                        ? "border-primary/25 bg-primary/12 text-primary"
                        : "border-white/8 bg-white/[0.03] group-hover:border-white/12 group-hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  <ChevronRight
                    className={cn(
                      "size-4 shrink-0 transition",
                      isActive ? "text-primary" : "text-transparent group-hover:text-muted-foreground",
                    )}
                  />
                </Link>
              );
            })}
          </nav>
        </div>

        {isAdmin ? (
          <div className="mt-5 min-w-0">
            <p className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Internal
            </p>
            <nav className="mt-2 space-y-1">
              {adminNavigation.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    className={cn(
                      "group flex min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition",
                      isActive
                        ? "surface-strong border border-white/10 text-foreground"
                        : "border border-transparent text-muted-foreground hover:border-white/8 hover:bg-white/[0.04] hover:text-foreground",
                    )}
                    href={item.href}
                  >
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg border transition",
                        isActive
                          ? "border-primary/25 bg-primary/12 text-primary"
                          : "border-white/8 bg-white/[0.03] text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : null}

        <div className="surface-subtle mt-auto rounded-[18px] p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
              <PanelLeft className="size-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Next step</p>
              <p className="truncate text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{stageLabel}</p>
            </div>
          </div>
          <p className="mt-2.5 text-sm leading-5 text-white/66">
            {stageState[stage].copy}
          </p>
        </div>
      </div>
    </aside>
  );
}
