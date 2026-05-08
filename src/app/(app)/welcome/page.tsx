"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const WELCOME_STORAGE_KEY = "dealflow-welcome-transition-v1";

export default function WelcomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const forceWelcome = searchParams.get("fresh") === "1" || searchParams.get("fromAuth") === "1";

  const steps = useMemo(
    () => [
      "Campaign strategy workspace ready",
      "Preview engine primed",
      "Guided builder loaded",
    ],
    [],
  );

  useEffect(() => {
    const seen = window.localStorage.getItem(WELCOME_STORAGE_KEY) === "seen";

    if (seen && !forceWelcome) {
      router.replace("/onboarding");
      return;
    }

    setReady(true);
    const startedAt = Date.now();
    const progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setProgress(Math.min(100, Math.round((elapsed / 1800) * 100)));
    }, 80);
    const redirectTimer = window.setTimeout(() => {
      window.localStorage.setItem(WELCOME_STORAGE_KEY, "seen");
      router.replace("/onboarding");
    }, 2100);

    return () => {
      window.clearInterval(progressTimer);
      window.clearTimeout(redirectTimer);
    };
  }, [forceWelcome, router]);

  if (!ready) {
    return null;
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center px-4">
      <Card className="relative w-full overflow-hidden p-8 sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_12%,rgba(103,232,249,0.18),transparent_26%),radial-gradient(circle_at_82%_30%,rgba(124,92,255,0.22),transparent_28%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
              <Sparkles className="size-3.5" />
              First campaign
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.065em] text-white sm:text-6xl">
              Welcome to DealFlow
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/64 sm:text-lg">
              Let’s build your first real estate campaign. DealFlow will recommend the strategy, show the preview, and keep the next click obvious.
            </p>
            <div className="mt-7 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#7c5cff,#55d5ff)] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {steps.map((step, index) => (
                <span
                  key={step}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/66"
                >
                  <CheckCircle2 className={index * 34 <= progress ? "size-3.5 text-emerald-200" : "size-3.5 text-white/26"} />
                  {step}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
            <p className="df-eyebrow text-cyan-100/70">Next</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">
              Start guided onboarding
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/58">
              One decision at a time: campaign type, market, inventory, offer, agent, plan, then preview.
            </p>
            <Button
              className="mt-5 w-full"
              onClick={() => {
                window.localStorage.setItem(WELCOME_STORAGE_KEY, "seen");
                router.replace("/onboarding");
              }}
            >
              Start now
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
