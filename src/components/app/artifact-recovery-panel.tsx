"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useProductI18n } from "@/components/i18n/product-locale-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type RecoveryStep = "generate-funnel" | "generate-creatives" | "build-campaign";

type ArtifactRecoveryPanelProps = {
  campaignId: string | null;
  title: string;
  description: string;
  missingArtifacts: string[];
  recoverySteps: RecoveryStep[];
};

async function runRecoveryStep(step: RecoveryStep, campaignId: string) {
  const route =
    step === "generate-funnel"
      ? "/api/generate-funnel"
      : step === "generate-creatives"
        ? "/api/generate-creatives"
        : "/api/build-campaign";

  const response = await fetch(route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ campaignId }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(data?.error || `Failed to run ${step}.`);
  }
}

export function ArtifactRecoveryPanel({
  campaignId,
  title,
  description,
  missingArtifacts,
  recoverySteps,
}: ArtifactRecoveryPanelProps) {
  const router = useRouter();
  const { t } = useProductI18n();
  const [isRecovering, setIsRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRecover() {
    if (!campaignId || recoverySteps.length === 0) {
      return;
    }

    setIsRecovering(true);
    setError(null);

    try {
      for (const step of recoverySteps) {
        await runRecoveryStep(step, campaignId);
      }

      router.refresh();
    } catch (recoveryError) {
      setError(
        recoveryError instanceof Error
          ? recoveryError.message
          : t("recovery.failed"),
      );
    } finally {
      setIsRecovering(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {t("recovery.eyebrow")}
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>

      <div className="mt-5 rounded-xl border border-border bg-background/50 p-4">
        <p className="text-sm font-medium text-foreground">{t("recovery.missingArtifacts")}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {missingArtifacts.map((artifact) => (
            <li key={artifact}>{artifact}</li>
          ))}
        </ul>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          disabled={!campaignId || recoverySteps.length === 0 || isRecovering}
          onClick={handleRecover}
        >
          {isRecovering ? t("recovery.regenerating") : t("recovery.regenerate")}
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/onboarding">{t("recovery.backOnboarding")}</Link>
        </Button>
      </div>
    </section>
  );
}
