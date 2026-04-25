import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "surface-subtle relative overflow-hidden rounded-[28px] border border-white/8 backdrop-blur-xl transition-all duration-300 will-change-transform before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(173,235,255,0.65),transparent)] hover:border-primary/15 hover:shadow-[0_34px_90px_-52px_rgba(88,184,255,0.34)]",
        className,
      )}
      {...props}
    />
  );
}
