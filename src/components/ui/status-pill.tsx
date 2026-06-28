import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const toneClasses: Record<StatusTone, string> = {
  neutral: "border-white/10 bg-white/[0.045] text-muted-foreground",
  success: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-300/25 bg-amber-400/10 text-amber-200",
  danger: "border-rose-300/25 bg-rose-400/10 text-rose-200",
  info: "border-sky-300/25 bg-sky-400/10 text-sky-200",
  accent: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
};

export function getStatusTone(status?: string | null): StatusTone {
  const normalized = String(status ?? "").trim().toLowerCase();

  if (!normalized) {
    return "neutral";
  }

  if (
    normalized.includes("ready") ||
    normalized.includes("active") ||
    normalized.includes("success") ||
    normalized.includes("complete") ||
    normalized.includes("synced") ||
    normalized.includes("approved")
  ) {
    return "success";
  }

  if (
    normalized.includes("blocked") ||
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("revoked") ||
    normalized.includes("missing")
  ) {
    return "danger";
  }

  if (
    normalized.includes("waiting") ||
    normalized.includes("pending") ||
    normalized.includes("review") ||
    normalized.includes("paused") ||
    normalized.includes("warning") ||
    normalized.includes("degraded")
  ) {
    return "warning";
  }

  if (normalized.includes("info") || normalized.includes("test") || normalized.includes("draft")) {
    return "info";
  }

  return "neutral";
}

export function StatusPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
