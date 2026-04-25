import { cn } from "@/lib/utils";

const toneClasses = {
  neutral: "border-white/10 bg-white/[0.05] text-muted-foreground",
  info: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  danger: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  accent: "border-cyan-300/20 bg-cyan-300/10 text-cyan-200",
} as const;

type StatusTone = keyof typeof toneClasses;

type StatusPillProps = React.ComponentProps<"span"> & {
  tone?: StatusTone;
};

export function StatusPill({
  className,
  tone = "neutral",
  ...props
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

export function getStatusTone(value?: string | null): StatusTone {
  const normalized = (value ?? "").toString().toLowerCase();

  if (normalized === "connected") {
    return "success";
  }

  if (normalized === "error") {
    return "danger";
  }

  if (normalized === "pending") {
    return "warning";
  }

  if (
    normalized.includes("won") ||
    normalized.includes("active") ||
    normalized.includes("complete") ||
    normalized.includes("healthy") ||
    normalized.includes("connected") ||
    normalized.includes("booked") ||
    normalized.includes("success")
  ) {
    return "success";
  }

  if (
    normalized.includes("review") ||
    normalized.includes("in progress") ||
    normalized.includes("scheduled") ||
    normalized.includes("pending")
  ) {
    return "warning";
  }

  if (
    normalized.includes("failed") ||
    normalized.includes("issue") ||
    normalized.includes("lost") ||
    normalized.includes("missing") ||
    normalized.includes("cancel")
  ) {
    return "danger";
  }

  if (
    normalized.includes("new") ||
    normalized.includes("qualified") ||
    normalized.includes("closed") ||
    normalized.includes("high")
  ) {
    return "info";
  }

  return "neutral";
}
