"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProductI18n } from "@/components/i18n/product-locale-provider";

type AppErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppErrorPage({ error, reset }: AppErrorPageProps) {
  const { t } = useProductI18n();

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="max-w-2xl p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300/90">
          {t("error.title")}
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-balance">
          {t("error.title")}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
          {t("error.body")}
        </p>
        <div className="mt-6 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            {t("common.status")}
          </p>
          <p className="mt-3 text-sm leading-7 text-white/85">
            {t("error.body")}
          </p>
          {error?.digest ? (
            <p className="mt-3 text-xs text-white/50">
              Error digest: {error.digest}
            </p>
          ) : null}
        </div>
        <div className="mt-6 flex justify-start">
          <Button onClick={reset}>{t("error.retry")}</Button>
        </div>
      </Card>
    </div>
  );
}
