import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description: string;
  className?: string;
  guidance?: string;
};

export function EmptyState({ title, description, className, guidance }: EmptyStateProps) {
  return (
    <Card
      className={cn(
        "relative flex min-h-52 flex-col items-center justify-center overflow-hidden px-6 py-10 text-center",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(108,184,255,0.18),transparent_68%)]" />
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
        <span className="system-status-dot" />
        AI guidance ready
      </div>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-cyan-200/15 bg-cyan-300/[0.045] shadow-df-glow-blue">
        <span className="h-2.5 w-2.5 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(103,232,249,0.8)]" />
      </div>
      <p className="text-xl font-semibold tracking-[-0.04em]">{title}</p>
      <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
        {description}
      </p>
      <p className="mt-4 max-w-xl text-sm leading-6 text-white/60">
        {guidance ?? "When this section is ready, the system will surface the clearest next move automatically."}
      </p>
    </Card>
  );
}
