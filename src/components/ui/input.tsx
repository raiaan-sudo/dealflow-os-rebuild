import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-12 w-full rounded-df-control border border-white/10 bg-white/[0.045] px-4 py-2 text-sm text-foreground outline-none ring-offset-background backdrop-blur-xl transition-all duration-200 placeholder:text-muted-foreground focus-visible:-translate-y-[1px] focus-visible:border-cyan-200/40 focus-visible:bg-white/[0.07] focus-visible:shadow-[0_0_0_1px_rgba(103,232,249,0.18),0_20px_45px_-28px_rgba(108,184,255,0.5)] focus-visible:ring-2 focus-visible:ring-ring/60",
        className,
      )}
      {...props}
    />
  );
}
