"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

type StatusTone = "calm" | "active";

function getStatusForPath(pathname: string) {
  if (pathname.startsWith("/launching")) {
    return {
      label: "Launch status",
      title: "Launch workflow in progress",
      description: "The system is waiting on confirmed runtime state before moving forward.",
      tone: "active" as StatusTone,
    };
  }

  if (pathname.startsWith("/launch")) {
    return {
      label: "Launch status",
      title: "Launch setup in progress",
      description: "Complete the remaining checks, then continue into launch.",
      tone: "active" as StatusTone,
    };
  }

  if (pathname.startsWith("/integrations")) {
    return {
      label: "Connection status",
      title: "Integration setup",
      description: "Connect the required accounts here before launch can continue.",
      tone: "active" as StatusTone,
    };
  }

  if (pathname.startsWith("/builder")) {
    return {
      label: "Build status",
      title: "Guided build active",
      description: "The funnel and creative drafts update here as you shape the campaign.",
      tone: "calm" as StatusTone,
    };
  }

  if (pathname.startsWith("/dashboard")) {
    return {
      label: "Campaign status",
      title: "Results overview",
      description: "Review the current campaign state and next actions here.",
      tone: "calm" as StatusTone,
    };
  }

  return {
    label: "Workspace status",
    title: "Campaign workspace active",
    description: "Use the current step to keep moving through build, review, and launch.",
    tone: "calm" as StatusTone,
  };
}

export function SystemStatus() {
  const pathname = usePathname();
  const status = useMemo(() => getStatusForPath(pathname), [pathname]);

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
