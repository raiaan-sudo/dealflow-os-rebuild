"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, MessageSquareText, PencilLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  CreativeChatIntakeState,
  CreativeIntakeAnswers,
  CreativeIntakeCampaignDefaults,
} from "@/lib/services/creative-chat-intake-service";

type CreativeChatIntakeProps = {
  campaignId: string;
  defaults: CreativeIntakeCampaignDefaults;
  initialIntake: CreativeChatIntakeState | null;
  mode?: "gate" | "compact";
};

const audienceOptions = [
  ["sellers", "Sellers"],
  ["buyers", "Buyers"],
  ["first_time_buyers", "First-time buyers"],
  ["investors", "Investors"],
  ["expired_listings", "Expired listings"],
  ["custom", "Custom"],
] as const;

const offerOptions = [
  ["free_home_valuation", "Free home valuation"],
  ["buyer_consultation", "Buyer consultation"],
  ["credit_preapproval_help", "Credit/pre-approval help"],
  ["listing_consultation", "Listing consultation"],
  ["custom", "Custom"],
] as const;

const brandOptions = [
  ["remax", "RE/MAX"],
  ["royal_lepage", "Royal LePage"],
  ["exp", "eXp"],
  ["keller_williams", "Keller Williams"],
  ["custom", "Custom"],
] as const;

const styleOptions = [
  ["ugc", "UGC"],
  ["bold_poster_ad", "Bold poster ad"],
  ["luxury", "Luxury"],
  ["local_expert", "Local expert"],
  ["simple_direct_response", "Simple direct-response"],
] as const;

function defaultAnswers(defaults: CreativeIntakeCampaignDefaults): CreativeIntakeAnswers {
  return {
    targetAudience:
      defaults.campaignType === "seller"
        ? "sellers"
        : defaults.campaignType === "investor"
          ? "investors"
          : "buyers",
    offer: "custom",
    customOffer: defaults.offer ?? "",
    brokerageBrand: "custom",
    customBrokerageBrand: defaults.brand ?? "",
    market: defaults.market ?? "",
    creativeStyle: "simple_direct_response",
    constraints: "",
    cta: defaults.cta ?? "See My Options",
    platformPlacement: "Meta feed and story placements",
    propertyType: defaults.propertyType ?? "",
  };
}

function getAnswerLabel(value: string | null | undefined, options: readonly (readonly [string, string])[]) {
  return options.find(([key]) => key === value)?.[1] ?? value ?? "Not set";
}

export function CreativeChatIntake({
  campaignId,
  defaults,
  initialIntake,
  mode = "gate",
}: CreativeChatIntakeProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<CreativeIntakeAnswers>({
    ...defaultAnswers(defaults),
    ...(initialIntake?.answers ?? {}),
  });
  const [revisionMessage, setRevisionMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const approved = initialIntake?.approvalStatus === "approved" && initialIntake.brief?.completion.complete === true;
  const revisionRequested = initialIntake?.approvalStatus === "revision_requested";
  const savedDraft = initialIntake?.approvalStatus === "draft" && Boolean(initialIntake?.updatedAt);
  const brief = initialIntake?.brief ?? null;
  const promptPreview = initialIntake?.promptVersion?.sanitizedPreview ?? null;
  const complete = useMemo(() => {
    return Boolean(
      answers.targetAudience &&
      (answers.targetAudience !== "custom" || answers.customAudience?.trim()) &&
      answers.offer &&
      (answers.offer !== "custom" || answers.customOffer?.trim()) &&
      answers.brokerageBrand &&
      (answers.brokerageBrand !== "custom" || answers.customBrokerageBrand?.trim()) &&
      answers.market?.trim() &&
      answers.creativeStyle,
    );
  }, [answers]);

  function updateAnswer(next: Partial<CreativeIntakeAnswers>) {
    setAnswers((current) => ({ ...current, ...next }));
    setError(null);
    setNotice(null);
  }

  async function persist(action: "save_answers" | "approve" | "revise") {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/creative-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          answers,
          revisionMessage: action === "revise" ? revisionMessage : undefined,
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Creative brief could not be saved.");
      }

      if (action === "revise") {
        setRevisionMessage("");
      }
      setNotice(
        action === "approve"
          ? "Creative brief approved. Paid rendering can continue after the workspace refreshes."
          : action === "revise"
            ? "Revision requested. Paid rendering stays blocked until the updated brief is approved."
            : "Draft saved. Paid rendering is still blocked until you approve the brief.",
      );
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Creative brief could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "compact" && approved) {
    return (
      <Card className="border-emerald-300/16 bg-emerald-300/[0.045] p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <BadgeCheck className="size-4 text-emerald-100" />
              <p className="text-sm font-semibold text-foreground">Creative brief approved</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {promptPreview || `${brief?.creativeStyle ?? "Creative"} direction for ${brief?.targetAudience ?? "this audience"}.`}
            </p>
            <p className="mt-2 text-xs leading-5 text-emerald-100/80">
              Requesting a revision will pause paid rendering until the revised brief is approved again.
            </p>
          </div>
          <div className="min-w-0 lg:w-[420px]">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Revision note
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                value={revisionMessage}
                onChange={(event) => setRevisionMessage(event.target.value)}
                placeholder="Make it more local, premium, or seller-focused"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={saving || !revisionMessage.trim()}
                onClick={() => void persist("revise")}
              >
                Revise
              </Button>
            </div>
            {notice ? <p className="mt-2 text-sm text-emerald-200" aria-live="polite">{notice}</p> : null}
            {error ? <p className="mt-2 text-sm text-rose-300" aria-live="assertive">{error}</p> : null}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.62fr)]">
        <section className="min-w-0 border-b border-white/10 p-5 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex items-start gap-3">
            <div className="grid size-11 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100">
              <MessageSquareText className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/72">
                Creative chat intake
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                Review the creative direction before paid rendering
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Answer the short prompts once. DealFlow turns them into a structured brief and only renders paid media after approval.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5">
            {revisionRequested ? (
              <div className="rounded-[20px] border border-amber-300/18 bg-amber-300/[0.07] p-4 text-sm leading-6 text-amber-100">
                Revisions were requested for this brief. Update the answers below, then approve the brief again before DealFlow can render paid images or videos.
              </div>
            ) : savedDraft ? (
              <div className="rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4 text-sm leading-6 text-cyan-100">
                Draft recovered from your last session. Review the answers and approve the brief when the direction is ready.
              </div>
            ) : null}
            <ChoiceGroup
              label="Who are you targeting?"
              value={answers.targetAudience}
              options={audienceOptions}
              onChange={(targetAudience) => updateAnswer({ targetAudience: targetAudience as CreativeIntakeAnswers["targetAudience"] })}
            />
            {answers.targetAudience === "custom" ? (
              <Input value={answers.customAudience ?? ""} onChange={(event) => updateAnswer({ customAudience: event.target.value })} placeholder="Describe the audience" />
            ) : null}

            <ChoiceGroup
              label="What offer are you promoting?"
              value={answers.offer}
              options={offerOptions}
              onChange={(offer) => updateAnswer({ offer: offer as CreativeIntakeAnswers["offer"] })}
            />
            {answers.offer === "custom" ? (
              <Input value={answers.customOffer ?? ""} onChange={(event) => updateAnswer({ customOffer: event.target.value })} placeholder="Offer or lead magnet" />
            ) : null}

            <ChoiceGroup
              label="What brokerage/brand should this match?"
              value={answers.brokerageBrand}
              options={brandOptions}
              onChange={(brokerageBrand) => updateAnswer({ brokerageBrand: brokerageBrand as CreativeIntakeAnswers["brokerageBrand"] })}
            />
            {answers.brokerageBrand === "custom" ? (
              <Input value={answers.customBrokerageBrand ?? ""} onChange={(event) => updateAnswer({ customBrokerageBrand: event.target.value })} placeholder="Brokerage or brand" />
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">City or market</span>
                <Input value={answers.market ?? ""} onChange={(event) => updateAnswer({ market: event.target.value })} placeholder="Toronto, ON" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Property focus</span>
                <Input value={answers.propertyType ?? ""} onChange={(event) => updateAnswer({ propertyType: event.target.value })} placeholder="Detached homes" />
              </label>
            </div>

            <ChoiceGroup
              label="What creative style do you want?"
              value={answers.creativeStyle}
              options={styleOptions}
              onChange={(creativeStyle) => updateAnswer({ creativeStyle: creativeStyle as CreativeIntakeAnswers["creativeStyle"] })}
            />

            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Must-have text, disclaimer, or claim constraints</span>
              <textarea
                aria-label="Must-have text, disclaimer, or claim constraints"
                className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-200/30"
                value={answers.constraints ?? ""}
                onChange={(event) => updateAnswer({ constraints: event.target.value })}
                placeholder="Example: avoid guaranteed approval claims, mention that qualification depends on lender review"
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void persist("save_answers")}>
                {saving ? "Saving..." : "Save draft"}
              </Button>
              <Button type="button" disabled={saving || !complete} onClick={() => void persist("approve")}>
                {saving ? "Approving..." : "Approve brief and continue"}
              </Button>
            </div>
            {!complete ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Complete the required audience, offer, brand, market, and style fields before approving. Saving a draft will not unlock paid rendering.
              </p>
            ) : null}
            {notice ? (
              <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100" aria-live="polite">
                {notice}
              </p>
            ) : null}
            {error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100" aria-live="assertive">{error}</p> : null}
          </div>
        </section>

        <aside className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-100" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Review gate</p>
          </div>
          <div className="mt-5 space-y-3">
            <SummaryRow label="Audience" value={answers.targetAudience === "custom" ? answers.customAudience : getAnswerLabel(answers.targetAudience, audienceOptions)} />
            <SummaryRow label="Offer" value={answers.offer === "custom" ? answers.customOffer : getAnswerLabel(answers.offer, offerOptions)} />
            <SummaryRow label="Brand" value={answers.brokerageBrand === "custom" ? answers.customBrokerageBrand : getAnswerLabel(answers.brokerageBrand, brandOptions)} />
            <SummaryRow label="Market" value={answers.market} />
            <SummaryRow label="Style" value={getAnswerLabel(answers.creativeStyle, styleOptions)} />
            <SummaryRow label="CTA" value={answers.cta || defaults.cta || "See My Options"} />
          </div>
          <div className="mt-5 rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4 text-sm leading-6 text-muted-foreground">
            <PencilLine className="mb-3 size-4 text-cyan-100" />
            No provider image or video call runs from this intake. Paid rendering stays blocked until the brief is approved.
          </div>
        </aside>
      </div>
    </Card>
  );
}

function ChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string | null;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map(([key, title]) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(key)}
              className={cn(
                "rounded-full border px-3 py-2 text-xs font-semibold transition",
                active
                  ? "border-cyan-200/36 bg-cyan-300/[0.1] text-cyan-50"
                  : "border-white/10 bg-white/[0.035] text-white/64 hover:border-cyan-200/18",
              )}
            >
              {title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value?.trim() || "Not set"}</p>
    </div>
  );
}
