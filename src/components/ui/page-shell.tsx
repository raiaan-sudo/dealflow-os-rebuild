import { cn } from "@/lib/utils";

export function PageShell({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("df-container df-page-stack min-w-0 overflow-x-clip", className)} {...props}>
      {children}
    </div>
  );
}

export function SectionContainer({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section className={cn("df-page-stack min-w-0 overflow-x-clip", className)} {...props}>
      {children}
    </section>
  );
}
