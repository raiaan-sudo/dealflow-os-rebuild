"use client";

import { usePathname } from "next/navigation";

export function GuidedFlowBanner() {
  const pathname = usePathname();
  const hiddenForPrimaryFlows =
    pathname.startsWith("/builder") ||
    pathname.startsWith("/build") ||
    pathname.startsWith("/paywall") ||
    pathname.startsWith("/preview") ||
    pathname.startsWith("/review") ||
    pathname.startsWith("/integrations") ||
    pathname.startsWith("/launch") ||
    pathname.startsWith("/go-live") ||
    pathname.startsWith("/campaign") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/results");

  if (hiddenForPrimaryFlows) {
    return null;
  }

  return null;
}
