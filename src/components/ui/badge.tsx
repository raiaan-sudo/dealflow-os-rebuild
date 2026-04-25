import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}
