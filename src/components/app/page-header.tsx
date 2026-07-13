"use client";

import { useProductI18n } from "@/components/i18n/product-locale-provider";

type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  guidance?: string;
  action?: React.ReactNode;
};

export function PageHeader({ title, description, eyebrow, guidance, action }: PageHeaderProps) {
  const { t } = useProductI18n();

  return (
    <div className="surface-guided rounded-df-panel px-6 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            {eyebrow ? (
              <p className="df-eyebrow">
                {eyebrow}
              </p>
            ) : null}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary shadow-[0_0_22px_rgba(116,199,255,0.12)]">
              <span className="system-status-dot" />
              {t("common.guided")}
            </div>
          </div>
          <h1 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.065em] sm:text-5xl">
            {title}
          </h1>
          <p className="df-body-muted mt-3">
            {description}
          </p>
          <p className="mt-4 text-sm leading-6 text-primary/80">
            {guidance ?? t("common.guidance")}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
