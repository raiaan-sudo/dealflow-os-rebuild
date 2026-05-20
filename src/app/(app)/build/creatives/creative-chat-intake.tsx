"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CheckCircle2, FileCheck2, PencilLine, ShieldCheck, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  CreativeChatIntakeState,
  CreativeIntakeAnswers,
  CreativeIntakeCampaignDefaults,
} from "@/lib/services/creative-chat-intake-service";
import {
  buildCreativeUgcScriptDraft,
  normalizeCreativeOfferTitle,
  validateCreativeUgcScriptDraft,
} from "@/lib/services/creative-ugc-script-service";

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

const brandOptions = [
  ["remax", "RE/MAX"],
  ["royal_lepage", "Royal LePage"],
  ["exp", "eXp"],
  ["keller_williams", "Keller Williams"],
  ["custom", "Custom"],
] as const;

const styleOptions = [
  ["clean_local_expert", "Clean Local Expert"],
  ["bold_offer_focused", "Bold Offer Focused"],
  ["premium_home_sale_guide", "Premium Home Sale Guide"],
] as const;

const lengthOptions = [
  ["15", "15 sec"],
  ["20", "20 sec"],
  ["30", "30 sec"],
] as const;

const personaOptions = [
  ["Local Agent", "Local Agent"],
  ["Real Estate Advisor", "Real Estate Advisor"],
  ["Direct Response Narrator", "Direct Response Narrator"],
] as const;

const hookOptions = [
  ["Speed to Sell", "Speed to Sell"],
  ["Price Confidence", "Price Confidence"],
  ["Avoid Wasted Time", "Avoid Wasted Time"],
  ["Local Market Reality", "Local Market Reality"],
] as const;

const visualOptions = [
  ["Talking-head with local captions", "Talking-head with local captions"],
  ["Listing walkthrough style", "Listing walkthrough style"],
  ["Clean direct-response explainer", "Clean direct-response explainer"],
] as const;

function defaultAnswers(defaults: CreativeIntakeCampaignDefaults): CreativeIntakeAnswers {
  const offerTitle = normalizeCreativeOfferTitle({
    value: defaults.offer,
    campaignType: defaults.campaignType,
    audience: defaults.audience,
  });
  const draft = buildCreativeUgcScriptDraft({
    campaignType: defaults.campaignType,
    audience: defaults.audience,
    market: defaults.market,
    offerTitle,
    offerMechanism: defaults.offer,
    cta: defaults.cta ?? "See My Options",
    targetDurationSeconds: 20,
    creatorPersona: "Local Agent",
    hookAngle: "Speed to Sell",
    visualStyle: "Talking-head with local captions",
  });
  return {
    targetAudience:
      defaults.campaignType === "seller"
        ? "sellers"
        : defaults.campaignType === "investor"
          ? "investors"
          : "buyers",
    offer: "custom",
    customOffer: offerTitle,
    offerTitle,
    offerMechanism: defaults.offer ?? "",
    brokerageBrand: "custom",
    customBrokerageBrand: defaults.brand ?? "",
    market: defaults.market ?? "",
    creativeStyle: "clean_local_expert",
    staticStyle: "clean_local_expert",
    constraints: "",
    cta: defaults.cta ?? "See My Options",
    platformPlacement: "Meta feed and story placements",
    propertyType: defaults.propertyType ?? "",
    outputMode: "finished_ad",
    generationPhase: "static_and_ugc",
    targetDurationSeconds: 20,
    creatorPersona: "Local Agent",
    hookAngle: "Speed to Sell",
    visualStyle: "Talking-head with local captions",
    pacing: "Fast hook, clear mechanism, calm CTA",
    cameraStyle: "Phone-camera creator POV",
    captionOverlayStyle: "Large readable captions only when useful",
    referenceExamples: "",
    goodBadExamples: "",
    mustUseLanguage: "",
    mustAvoid: "No fake dashboards, fake listing sheets, guaranteed approval claims, tiny captions, or generic stock clips",
    selectedUgcConceptId: "",
    ugcDefaultStyleAccepted: false,
    ugcApprovedScript: draft.lines.join("\n"),
    ugcShotList: draft.shotList,
    ugcOnScreenText: draft.onScreenText,
    ugcScriptVersion: draft.version,
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
  const [activeStep, setActiveStep] = useState(0);
  const approved = initialIntake?.approvalStatus === "approved" && initialIntake.brief?.completion.complete === true;
  const revisionRequested = initialIntake?.approvalStatus === "revision_requested";
  const savedDraft = initialIntake?.approvalStatus === "draft" && Boolean(initialIntake?.updatedAt);
  const brief = initialIntake?.brief ?? null;
  const promptPreview = initialIntake?.promptVersion?.sanitizedPreview ?? null;
  const ugcDraft = useMemo(() => buildCreativeUgcScriptDraft({
    campaignType: defaults.campaignType,
    audience: answers.targetAudience === "custom" ? answers.customAudience : getAnswerLabel(answers.targetAudience, audienceOptions),
    market: answers.market,
    offerTitle: answers.offerTitle || answers.customOffer || defaults.offer,
    offerMechanism: answers.offerMechanism || defaults.offer,
    cta: answers.cta || defaults.cta,
    targetDurationSeconds: answers.targetDurationSeconds,
    creatorPersona: answers.creatorPersona,
    hookAngle: answers.hookAngle,
    visualStyle: answers.visualStyle,
  }), [answers, defaults]);
  const scriptLines = (answers.ugcApprovedScript?.trim() ? answers.ugcApprovedScript : ugcDraft.lines.join("\n"))
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const scriptValidation = validateCreativeUgcScriptDraft({
    script: { ...ugcDraft, lines: scriptLines },
    campaignType: defaults.campaignType,
    audience: answers.targetAudience === "custom" ? answers.customAudience : getAnswerLabel(answers.targetAudience, audienceOptions),
    offerTitle: answers.offerTitle || answers.customOffer || defaults.offer,
  });
  const scriptApproved = Boolean(answers.ugcScriptApprovedAt) && scriptValidation.accepted;
  const complete = useMemo(() => {
    return Boolean(
      answers.targetAudience &&
      (answers.targetAudience !== "custom" || answers.customAudience?.trim()) &&
      (answers.offerTitle?.trim() || answers.customOffer?.trim()) &&
      answers.brokerageBrand &&
      (answers.brokerageBrand !== "custom" || answers.customBrokerageBrand?.trim()) &&
      answers.market?.trim() &&
      (answers.staticStyle || answers.creativeStyle) &&
      ((answers.generationPhase !== "ugc_video" && answers.generationPhase !== "static_and_ugc") || scriptApproved),
    );
  }, [answers, scriptApproved]);

  function updateAnswer(next: Partial<CreativeIntakeAnswers>) {
    setAnswers((current) => ({ ...current, ...next }));
    setError(null);
    setNotice(null);
  }

  function refreshScriptDraft(next: Partial<CreativeIntakeAnswers> = {}) {
    const merged = { ...answers, ...next };
    const draft = buildCreativeUgcScriptDraft({
      campaignType: defaults.campaignType,
      audience: merged.targetAudience === "custom" ? merged.customAudience : getAnswerLabel(merged.targetAudience, audienceOptions),
      market: merged.market,
      offerTitle: merged.offerTitle || merged.customOffer || defaults.offer,
      offerMechanism: merged.offerMechanism || defaults.offer,
      cta: merged.cta || defaults.cta,
      targetDurationSeconds: merged.targetDurationSeconds,
      creatorPersona: merged.creatorPersona,
      hookAngle: merged.hookAngle,
      visualStyle: merged.visualStyle,
    });
    updateAnswer({
      ...next,
      ugcApprovedScript: draft.lines.join("\n"),
      ugcShotList: draft.shotList,
      ugcOnScreenText: draft.onScreenText,
      ugcScriptVersion: draft.version,
      ugcScriptApprovedAt: null,
    });
  }

  function approveScript() {
    updateAnswer({
      ugcApprovedScript: scriptLines.join("\n"),
      ugcShotList: answers.ugcShotList?.length ? answers.ugcShotList : ugcDraft.shotList,
      ugcOnScreenText: answers.ugcOnScreenText?.length ? answers.ugcOnScreenText : ugcDraft.onScreenText,
      ugcScriptVersion: ugcDraft.version,
      ugcScriptApprovedAt: new Date().toISOString(),
    });
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
            <Button asChild type="button" variant="secondary" className="mt-3 w-full">
              <Link href={`/build/creatives?campaignId=${encodeURIComponent(campaignId)}&creativeBrief=edit`}>
                Open Marketing Studio chat
              </Link>
            </Button>
            {notice ? <p className="mt-2 text-sm text-emerald-200" aria-live="polite">{notice}</p> : null}
            {error ? <p className="mt-2 text-sm text-rose-300" aria-live="assertive">{error}</p> : null}
          </div>
        </div>
      </Card>
    );
  }

  const steps = [
    ["Basics", "Confirm campaign"],
    ["Static", "Choose style"],
    ["UGC Script", "Approve script"],
    ["Review", "Generate set"],
  ] as const;
  const audienceLabel = answers.targetAudience === "custom"
    ? answers.customAudience
    : getAnswerLabel(answers.targetAudience, audienceOptions);

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,0.98fr)_minmax(340px,0.52fr)]">
        <section className="min-w-0 border-b border-white/10 p-5 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex items-start gap-3">
            <div className="grid size-11 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100">
              <WandSparkles className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/72">Creative brief</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                Build the creative set before anything renders
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Confirm the offer, choose the static style, approve the UGC script, then generate the creative set. Final media only becomes launch-ready after it is saved to your creative library and passes DealFlow review.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-4">
            {steps.map(([title, subtitle], index) => {
              const active = activeStep === index;
              const done = index === 0
                ? Boolean(answers.market?.trim() && (answers.offerTitle?.trim() || answers.customOffer?.trim()) && answers.cta?.trim())
                : index === 1
                  ? Boolean(answers.staticStyle || answers.creativeStyle)
                  : index === 2
                    ? scriptApproved
                    : complete;
              return (
                <button
                  key={title}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition",
                    active ? "border-cyan-200/40 bg-cyan-300/[0.11]" : "border-white/10 bg-white/[0.035] hover:border-cyan-200/24",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {done ? <CheckCircle2 className="size-4 text-emerald-100" /> : null}
                    {title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{subtitle}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 grid gap-5">
            {revisionRequested ? (
              <div className="rounded-[20px] border border-amber-300/18 bg-amber-300/[0.07] p-4 text-sm leading-6 text-amber-100">
                Revisions were requested for this brief. Update the answers, approve the script, then approve the brief again.
              </div>
            ) : savedDraft ? (
              <div className="rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4 text-sm leading-6 text-cyan-100">
                Draft recovered from your last session. Review the guided brief and approve it when the direction is ready.
              </div>
            ) : null}

            {activeStep === 0 ? (
              <div className="grid gap-5">
                <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Auto-detected audience</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{audienceLabel || "Audience detected from campaign"}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">DealFlow uses the campaign type and saved strategy here, so customers do not need to re-answer targeting setup.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Market</span>
                    <Input value={answers.market ?? ""} onChange={(event) => updateAnswer({ market: event.target.value, ugcScriptApprovedAt: null })} placeholder="Brampton, ON" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Offer title</span>
                    <Input value={answers.offerTitle ?? answers.customOffer ?? ""} onChange={(event) => updateAnswer({ offerTitle: event.target.value, customOffer: event.target.value, ugcScriptApprovedAt: null })} placeholder="14-Day Home Sale Plan" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Primary CTA</span>
                    <Input value={answers.cta ?? ""} onChange={(event) => updateAnswer({ cta: event.target.value, ugcScriptApprovedAt: null })} placeholder="See if your home qualifies" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Tone preference</span>
                    <Input value={answers.constraints ?? ""} onChange={(event) => updateAnswer({ constraints: event.target.value })} placeholder="Clear, local, direct" />
                  </label>
                </div>
              </div>
            ) : null}

            {activeStep === 1 ? (
              <ChoiceGroup
                label="Choose static ad direction"
                value={answers.staticStyle ?? answers.creativeStyle}
                options={styleOptions}
                onChange={(creativeStyle) => updateAnswer({
                  staticStyle: creativeStyle as CreativeIntakeAnswers["staticStyle"],
                  creativeStyle: creativeStyle as CreativeIntakeAnswers["creativeStyle"],
                })}
              />
            ) : null}

            {activeStep === 2 ? (
              <div className="grid gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChoiceGroup label="Target length" value={String(answers.targetDurationSeconds ?? 20)} options={lengthOptions} onChange={(value) => refreshScriptDraft({ targetDurationSeconds: Number(value) })} />
                  <ChoiceGroup label="Creator persona" value={answers.creatorPersona} options={personaOptions} onChange={(value) => refreshScriptDraft({ creatorPersona: value })} />
                  <ChoiceGroup label="Hook angle" value={answers.hookAngle} options={hookOptions} onChange={(value) => refreshScriptDraft({ hookAngle: value })} />
                  <ChoiceGroup label="Visual style" value={answers.visualStyle} options={visualOptions} onChange={(value) => refreshScriptDraft({ visualStyle: value })} />
                </div>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Approved UGC script</span>
                  <textarea
                    aria-label="Approved UGC script"
                    className="min-h-[190px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-200/30"
                    value={answers.ugcApprovedScript ?? ugcDraft.lines.join("\n")}
                    onChange={(event) => updateAnswer({ ugcApprovedScript: event.target.value, ugcScriptApprovedAt: null })}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <PreviewList title="Shot list" items={answers.ugcShotList?.length ? answers.ugcShotList : ugcDraft.shotList} />
                  <PreviewList title="On-screen text" items={answers.ugcOnScreenText?.length ? answers.ugcOnScreenText : ugcDraft.onScreenText} />
                </div>
                {scriptValidation.accepted ? (
                  <p className="rounded-2xl border border-emerald-300/18 bg-emerald-300/[0.08] p-3 text-sm text-emerald-100">Script quality checks pass. Approve it before generating media.</p>
                ) : (
                  <p className="rounded-2xl border border-amber-300/18 bg-amber-300/[0.08] p-3 text-sm text-amber-100">Fix before approval: {scriptValidation.reasons.join(", ")}</p>
                )}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="button" variant="secondary" onClick={() => refreshScriptDraft()}>
                    Refresh script draft
                  </Button>
                  <Button type="button" disabled={!scriptValidation.accepted} onClick={approveScript}>
                    {scriptApproved ? "Script approved" : "Approve script"}
                  </Button>
                </div>
              </div>
            ) : null}

            {activeStep === 3 ? (
              <div className="grid gap-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  Static previews and the approved UGC script are ready immediately. Final AI-rendered media updates after rendering completes and DealFlow accepts the asset.
                </p>
                <PreviewList
                  title="Ready checklist"
                  items={[
                    answers.market?.trim() ? "Campaign basics complete" : "Campaign basics incomplete",
                    answers.staticStyle || answers.creativeStyle ? "Static direction selected" : "Static direction needed",
                    scriptApproved ? "UGC script approved" : "UGC script approval needed",
                    complete ? "Creative set ready to generate" : "Complete the missing items before approval",
                  ]}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" variant="secondary" disabled={saving || activeStep === 0} onClick={() => setActiveStep((step) => Math.max(0, step - 1))}>
                Back
              </Button>
              {activeStep < 3 ? (
                <Button type="button" disabled={saving} onClick={() => setActiveStep((step) => Math.min(3, step + 1))}>
                  Continue
                </Button>
              ) : (
                <>
                  <Button type="button" variant="secondary" disabled={saving} onClick={() => void persist("save_answers")}>
                    {saving ? "Saving..." : "Save draft"}
                  </Button>
                  <Button type="button" disabled={saving || !complete} onClick={() => void persist("approve")}>
                    {saving ? "Approving..." : "Generate Creative Set"}
                  </Button>
                </>
              )}
            </div>
            {!complete && activeStep === 3 ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Confirm campaign basics, choose a static direction, and approve the UGC script before generating the creative set.
              </p>
            ) : null}
            {notice ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100" aria-live="polite">{notice}</p> : null}
            {error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100" aria-live="assertive">{error}</p> : null}
          </div>
        </section>

        <aside className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-100" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Readiness</p>
          </div>
          <div className="mt-5 space-y-3">
            <SummaryRow label="Market" value={answers.market} />
            <SummaryRow label="Audience" value={audienceLabel} />
            <SummaryRow label="Offer" value={answers.offerTitle || answers.customOffer} />
            <SummaryRow label="CTA" value={answers.cta || defaults.cta || "See My Options"} />
            <SummaryRow label="Static style" value={getAnswerLabel(answers.staticStyle ?? answers.creativeStyle, styleOptions)} />
            <SummaryRow label="UGC script" value={scriptApproved ? "Approved" : "Needs approval"} />
          </div>
          <div className="mt-5 rounded-[20px] border border-emerald-300/16 bg-emerald-300/[0.055] p-4 text-sm leading-6 text-muted-foreground">
            <FileCheck2 className="mb-3 size-4 text-emerald-100" />
            Static previews appear immediately. Final AI-rendered media updates after rendering completes and passes DealFlow review.
          </div>
          <div className="mt-5 rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4 text-sm leading-6 text-muted-foreground">
            <PencilLine className="mb-3 size-4 text-cyan-100" />
            The UGC video render uses the approved script and shot list. Editing the script requires approval again before rendering.
          </div>
          {initialIntake?.messages?.length ? (
            <div className="mt-5 rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
              <p className="text-sm font-semibold text-foreground">Saved brief history</p>
              <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
                {initialIntake.messages.slice(-6).map((message) => (
                  <div key={message.id} className="rounded-2xl bg-white/[0.055] px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {message.content}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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

function PreviewList({ title, items }: { title: string; items?: readonly string[] | null }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <div className="mt-3 grid gap-2">
        {(items ?? []).filter(Boolean).map((item, index) => (
          <p key={`${title}-${index}`} className="text-sm leading-6 text-foreground">
            {item}
          </p>
        ))}
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
