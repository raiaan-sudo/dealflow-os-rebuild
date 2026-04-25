type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  guidance?: string;
  action?: React.ReactNode;
};

export function PageHeader({ title, description, eyebrow, guidance, action }: PageHeaderProps) {
  return (
    <div className="surface-guided rounded-[26px] px-6 py-6 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                {eyebrow}
              </p>
            ) : null}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary shadow-[0_0_22px_rgba(116,199,255,0.12)]">
              <span className="system-status-dot" />
              Guided
            </div>
          </div>
          <h1 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.06em] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-7 text-white/74 sm:text-[15px]">
            {description}
          </p>
          <p className="mt-4 text-sm leading-6 text-primary/80">
            {guidance ?? "The system is guiding the next best action so you can move forward without guesswork."}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
