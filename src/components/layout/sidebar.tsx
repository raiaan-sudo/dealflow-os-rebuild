"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, BarChart3, Eye, PanelLeft, Rocket, Wand2 } from "lucide-react";
import { useState } from "react";
import { adminNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { CampaignExperienceStage } from "@/lib/services/campaign-plan-service";

type ManagedWorkspaceOption = {
  id: string;
  name: string;
  partnerId: string | null;
  partnerName: string | null;
  active: boolean;
};

type AppSidebarProps = {
  organizationName: string;
  brandName?: string | null;
  brandLogoUrl?: string | null;
  isPartnerBranded?: boolean;
  isAdmin: boolean;
  managedWorkspaces?: ManagedWorkspaceOption[];
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

function BrandMark({
  brandName,
  logoUrl,
  isPartnerBranded,
}: {
  brandName: string;
  logoUrl?: string | null;
  isPartnerBranded?: boolean;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const canShowLogo = Boolean(isPartnerBranded && logoUrl && !logoFailed);
  const initials = brandName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "DF";

  if (canShowLogo) {
    return (
      <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-primary/20 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- Partner logos can come from arbitrary verified partner URLs and need client-side broken-image fallback. */}
        <img
          src={logoUrl ?? undefined}
          alt={`${brandName} logo`}
          className="max-h-7 max-w-7 object-contain"
          onError={() => setLogoFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-xs font-semibold text-primary">
      {initials}
    </div>
  );
}

function WorkspaceSwitcher({
  organizationName,
  managedWorkspaces,
  isAdmin,
}: {
  organizationName: string;
  managedWorkspaces: ManagedWorkspaceOption[];
  isAdmin: boolean;
}) {
  const [filter, setFilter] = useState("");
  const hasSwitcher = managedWorkspaces.length > 1;
  const visibleWorkspaces = managedWorkspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(filter.toLowerCase()),
  );

  if (!hasSwitcher) {
    return (
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
    );
  }

  return (
    <details className="mt-2.5 rounded-xl border border-white/8 bg-black/20 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(188,236,255,0.08)]">
      <summary className="cursor-pointer list-none">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Workspace
        </p>
        <div className="mt-1.5 space-y-1.5">
          <p className="min-w-0 truncate text-sm font-medium leading-5" title={organizationName}>
            {organizationName}
          </p>
          <Badge className="w-fit shrink-0 border-primary/20 bg-primary/10 text-primary">Switch workspace</Badge>
        </div>
      </summary>
      <div className="mt-3 space-y-2">
        <input
          className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs outline-none transition placeholder:text-muted-foreground focus:border-primary/30"
          placeholder="Search clients"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
          {visibleWorkspaces.map((workspace) => (
            <form key={workspace.id} action="/api/workspaces/switch" method="post">
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <button
                type="submit"
                className={cn(
                  "w-full rounded-lg border px-2 py-2 text-left text-xs transition",
                  workspace.active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-white/8 bg-white/[0.03] text-muted-foreground hover:border-primary/20 hover:text-foreground",
                )}
              >
                <span className="block truncate font-semibold">{workspace.name}</span>
                {workspace.partnerName ? (
                  <span className="block truncate text-[10px] text-muted-foreground">{workspace.partnerName}</span>
                ) : null}
              </button>
            </form>
          ))}
        </div>
        {isAdmin ? (
          <form action="/api/workspaces/switch" method="post" className="space-y-2 border-t border-white/8 pt-2">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Admin lookup
              <input
                className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs font-normal normal-case tracking-normal outline-none transition placeholder:text-muted-foreground focus:border-primary/30"
                name="workspaceLookup"
                placeholder="Workspace ID, name, or slug"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg border border-primary/20 bg-primary/10 px-2 py-2 text-left text-xs font-semibold text-primary transition hover:border-primary/35 hover:bg-primary/15"
            >
              Switch to workspace
            </button>
          </form>
        ) : null}
      </div>
    </details>
  );
}

export function AppSidebar({
  organizationName,
  brandName,
  brandLogoUrl,
  isPartnerBranded,
  isAdmin,
  managedWorkspaces = [],
  stage,
  activeCampaignId,
}: AppSidebarProps) {
  const pathname = usePathname();
  const campaignId = activeCampaignId ?? null;
  const displayBrandName = brandName || "DealFlow";
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
    { href: "/onboarding", label: "Build", icon: Wand2 },
    { href: "/preview", label: "Review", icon: Eye },
    { href: "/launch", label: "Launch", icon: Rocket },
    { href: "/dashboard", label: "Results", icon: BarChart3 },
  ];

  return (
    <aside className="hidden h-screen w-[216px] shrink-0 lg:flex xl:w-[228px]">
      <div className="flex h-full w-full flex-col overflow-hidden border-r border-white/6 bg-[linear-gradient(180deg,rgba(5,8,14,0.92),rgba(6,10,17,0.72))] px-3 py-3.5 backdrop-blur-2xl">
        <div className="surface-strong rounded-[18px] px-3 py-3">
          <div className="flex items-center gap-2.5">
            <BrandMark brandName={displayBrandName} logoUrl={brandLogoUrl} isPartnerBranded={isPartnerBranded} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-[-0.02em]">{displayBrandName}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {stageLabel}
              </p>
            </div>
          </div>
          <WorkspaceSwitcher organizationName={organizationName} managedWorkspaces={managedWorkspaces} isAdmin={isAdmin} />
        </div>

        <div className="mt-5 min-w-0">
          <p className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Product
          </p>
          <nav className="mt-2 space-y-1">
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
