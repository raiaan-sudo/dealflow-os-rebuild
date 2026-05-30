"use client";

import { CreditTopUpButton } from "@/components/billing/credit-top-up-button";

export function GenerationCreditTopUpPanel({
  surface = "creative",
}: {
  surface?: "image" | "video" | "creative";
}) {
  const label =
    surface === "video"
      ? "Video rendering needs generation credits."
      : surface === "image"
        ? "Premium ad rendering needs generation credits."
        : "Creative rendering needs generation credits.";

  return (
    <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-3 text-sm leading-6 text-cyan-50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-cyan-50">{label}</p>
          <p className="mt-1 text-cyan-100/85">
            Add a small credit top-up to continue paid generation. No provider render starts until credits are available.
          </p>
        </div>
        <div className="shrink-0">
          <CreditTopUpButton label="Add $10.00 credits" />
        </div>
      </div>
    </div>
  );
}
