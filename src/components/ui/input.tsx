import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.ComponentProps<"input">;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-[16px] border border-white/10 bg-white/[0.045] px-4 py-2 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";

export { Input };
