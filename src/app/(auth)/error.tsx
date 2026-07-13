"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProductI18n } from "@/components/i18n/product-locale-provider";

type AuthErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AuthErrorPage({ error, reset }: AuthErrorPageProps) {
  const { t } = useProductI18n();
  return (
    <main className="premium-grid flex min-h-screen items-center justify-center px-6 py-10">
      <Card className="max-w-lg p-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
          {t("error.title")}
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
          {t("auth.error.generic")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          {t("auth.error.unavailable")}
        </p>
        <div className="mt-6 flex justify-center">
          <Button onClick={reset}>{t("common.retry")}</Button>
        </div>
      </Card>
    </main>
  );
}
