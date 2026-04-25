import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "skeleton-shimmer rounded-2xl bg-white/[0.06]",
        className,
      )}
      {...props}
    />
  );
}
