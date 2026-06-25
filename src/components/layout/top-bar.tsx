"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { SystemStatus } from "@/components/layout/system-status";

type TopBarProps = {
  userName: string;
  userEmail: string;
  organizationName: string;
  brandName?: string | null;
  managedWorkspaces?: Array<{
    id: string;
    name: string;
    partnerId: string | null;
    partnerName: string | null;
    active: boolean;
  }>;
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

export function TopBar({
  userName,
  userEmail,
  organizationName,
  brandName,
  managedWorkspaces = [],
  activeCampaignId,
}: TopBarProps) {
  const pathname = usePathname();
  const campaignId = activeCampaignId ?? null;
  const hasWorkspaceSwitcher = managedWorkspaces.length > 1;

  if (pathname.startsWith("/preview")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/6 bg-[linear-gradient(180deg,rgba(6,10,16,0.9),rgba(6,10,16,0.62))] backdrop-blur-2xl">
      <div className="flex w-full min-w-0 items-center justify-between gap-3 px-4 py-2.5 lg:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0 max-w-[240px]">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {brandName || organizationName}
            </p>
            <p className="mt-0.5 truncate text-sm text-white/72">
              {organizationName}
            </p>
          </div>
          {hasWorkspaceSwitcher ? (
            <form action="/api/workspaces/switch" method="post" className="hidden min-w-[180px] sm:block lg:hidden">
              <label className="sr-only" htmlFor="mobile-workspace-switcher">Switch workspace</label>
              <select
                id="mobile-workspace-switcher"
                name="workspaceId"
                defaultValue={managedWorkspaces.find((workspace) => workspace.active)?.id}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
                className="h-9 max-w-[220px] rounded-xl border border-white/10 bg-white/[0.04] px-2 text-xs text-foreground outline-none"
              >
                {managedWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id} className="bg-slate-950 text-white">
                    {workspace.name}
                  </option>
                ))}
              </select>
            </form>
          ) : null}
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-center xl:flex">
          <div className="w-full max-w-[360px]">
            <SystemStatus />
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <div className="hidden min-w-0 max-w-[280px] items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.04] px-2.5 py-1.5 lg:flex">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-semibold text-primary shadow-[0_0_18px_rgba(116,199,255,0.16)]">
              {getInitials(userName)}
            </div>
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
            </div>
          </div>

          <Link
            href={buildCampaignScopedHref("/settings", campaignId)}
            aria-label="Open settings"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-muted-foreground transition hover:border-primary/20 hover:bg-primary/[0.08] hover:text-foreground"
          >
            <Settings className="size-4" />
          </Link>
          <SignOutButton />
        </div>
      </div>
      <nav
        aria-label="Primary mobile navigation"
        className="flex min-w-0 gap-1.5 overflow-x-auto border-t border-white/6 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:hidden"
      >
        {[
          { href: "/onboarding", label: "Build" },
          { href: "/preview", label: "Review" },
          { href: "/launch", label: "Launch" },
          { href: "/dashboard", label: "Results" },
        ].map((item) => {
          const active =
            item.href === "/onboarding"
              ? pathname.startsWith("/onboarding") || pathname.startsWith("/build")
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={buildCampaignScopedHref(item.href, campaignId)}
              className={
                active
                  ? "shrink-0 rounded-full border border-primary/25 bg-primary/12 px-2.5 py-1.5 text-primary"
                  : "shrink-0 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1.5"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
