"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { SystemStatus } from "@/components/layout/system-status";

type TopBarProps = {
  userName: string;
  userEmail: string;
  organizationName: string;
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

export function TopBar({ userName, userEmail, organizationName, activeCampaignId }: TopBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId") ?? activeCampaignId ?? null;

  if (pathname.startsWith("/preview")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/6 bg-[linear-gradient(180deg,rgba(6,10,16,0.9),rgba(6,10,16,0.62))] backdrop-blur-2xl">
      <div className="flex w-full min-w-0 items-center justify-between gap-3 px-4 py-2.5 lg:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0 max-w-[240px]">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {organizationName}
            </p>
            <p className="mt-0.5 truncate text-sm text-white/72">
              Campaign workspace
            </p>
          </div>
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
          { href: "/builder", label: "Build" },
          { href: "/preview", label: "Review" },
          { href: "/launch", label: "Launch" },
          { href: "/dashboard", label: "Results" },
        ].map((item) => {
          const active =
            item.href === "/builder"
              ? pathname.startsWith("/builder") || pathname.startsWith("/build")
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
