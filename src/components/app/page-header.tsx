type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  guidance?: string;
  action?: React.ReactNode;
};

export function PageHeader({ title, description, eyebrow, guidance, action }: PageHeaderProps) {
  return (
    <div className="surface-guided rounded-df-panel px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {eyebrow ? (
              <p className="df-eyebrow">
                {eyebrow}
              </p>
            ) : null}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary shadow-[0_0_18px_rgba(116,199,255,0.1)]">
              <span className="system-status-dot" />
              Guided
            </div>
          </div>
          <h1 className="mt-3 max-w-5xl text-balance text-2xl font-semibold tracking-[-0.035em] sm:text-4xl">
            {title}
          </h1>
          <p className="df-body-muted mt-2 max-w-4xl">
            {description}
          </p>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-primary/80">
            {guidance ?? "The system is guiding the next best action so you can move forward without guesswork."}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
