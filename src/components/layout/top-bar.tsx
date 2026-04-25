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
};

export function TopBar({ userName, userEmail, organizationName }: TopBarProps) {
  const pathname = usePathname();

  if (pathname.startsWith("/preview")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/6 bg-[linear-gradient(180deg,rgba(6,10,16,0.9),rgba(6,10,16,0.62))] backdrop-blur-2xl">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-3 lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {organizationName}
            </p>
            <p className="mt-1 truncate text-sm text-white/72">
              Campaign workspace
            </p>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-center xl:flex">
          <div className="w-full max-w-[400px]">
            <SystemStatus />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-[20px] border border-white/8 bg-white/[0.04] px-3 py-1.5 lg:flex">
            <div className="flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-sm font-semibold text-primary shadow-[0_0_22px_rgba(116,199,255,0.18)]">
              {getInitials(userName)}
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">{userName}</p>
              <p className="text-xs text-muted-foreground">{userEmail}</p>
            </div>
          </div>

          <Link
            href="/settings"
            className="flex size-10 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.04] text-muted-foreground transition hover:border-primary/20 hover:bg-primary/[0.08] hover:text-foreground"
          >
            <Settings className="size-4" />
          </Link>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
