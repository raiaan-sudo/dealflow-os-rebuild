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
        "relative overflow-hidden flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(108,184,255,0.18),transparent_68%)]" />
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
        <span className="system-status-dot" />
        AI guidance ready
      </div>
      <div className="mb-4 h-11 w-11 rounded-full border border-white/10 bg-white/[0.04] shadow-[0_14px_36px_-24px_rgba(108,184,255,0.55)]" />
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
