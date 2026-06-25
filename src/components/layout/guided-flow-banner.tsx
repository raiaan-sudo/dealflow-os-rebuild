"use client";

import { usePathname } from "next/navigation";

export function GuidedFlowBanner() {
  const pathname = usePathname();
  const hiddenForPrimaryFlows =
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/builder") ||
    pathname.startsWith("/build") ||
    pathname.startsWith("/paywall") ||
    pathname.startsWith("/preview") ||
    pathname.startsWith("/preview") ||
    pathname.startsWith("/integrations") ||
    pathname.startsWith("/launch") ||
    pathname.startsWith("/launch") ||
    pathname.startsWith("/campaign") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/dashboard");

  if (hiddenForPrimaryFlows) {
    return null;
  }

  return null;
}
