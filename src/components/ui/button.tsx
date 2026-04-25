import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 will-change-transform [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_18px_40px_-24px_rgba(108,184,255,0.8)] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_24px_56px_-24px_rgba(108,184,255,0.95)]",
        secondary:
          "border border-white/10 bg-white/[0.045] text-card-foreground hover:-translate-y-0.5 hover:border-white/14 hover:bg-white/[0.08] hover:shadow-[0_18px_40px_-24px_rgba(108,184,255,0.25)]",
        ghost: "text-foreground hover:-translate-y-0.5 hover:bg-white/[0.06]",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-9 px-4 text-[13px]",
        lg: "h-12 px-6 text-base",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
