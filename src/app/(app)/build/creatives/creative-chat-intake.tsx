"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, FileCheck2, MessageSquareText, PencilLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  CreativeChatIntakeState,
  CreativeIntakeAnswers,
  CreativeIntakeCampaignDefaults,
  CreativeIntakeGenerationPhase,
  CreativeIntakeUgcConcept,
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
  ["ugc", "Native-style static ad"],
  ["bold_poster_ad", "Bold poster ad"],
  ["luxury", "Luxury"],
  ["local_expert", "Local expert"],
  ["simple_direct_response", "Simple direct-response"],
] as const;

function phaseIncludesStatic(phase?: CreativeIntakeGenerationPhase | string | null) {
  return phase === "static" || phase === "static_and_ugc";
}

function phaseIncludesUgcVideo(phase?: CreativeIntakeGenerationPhase | string | null) {
  return phase === "ugc_video" || phase === "static_and_ugc";
}

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
    outputMode: "finished_ad",
    generationPhase: "static_and_ugc",
    targetDurationSeconds: 20,
    creatorPersona: "Trusted local agent / buyer guide",
    hookAngle: "Call out the buyer pain in the first two seconds",
    visualStyle: "Native vertical social video with real Toronto homebuyer context",
    pacing: "Fast hook, clear mechanism, calm CTA",
    cameraStyle: "Phone-camera creator POV",
    captionOverlayStyle: "Large readable captions only when useful",
    referenceExamples: "",
    goodBadExamples: "",
    mustUseLanguage: "",
    mustAvoid: "No fake dashboards, fake listing sheets, guaranteed approval claims, tiny captions, or generic stock clips",
    selectedUgcConceptId: "",
    ugcDefaultStyleAccepted: false,
  };
}

function getAnswerLabel(value: string | null | undefined, options: readonly (readonly [string, string])[]) {
  return options.find(([key]) => key === value)?.[1] ?? value ?? "Not set";
}

function buildClientUgcConceptOptions(
  answers: CreativeIntakeAnswers,
  defaults: CreativeIntakeCampaignDefaults,
): CreativeIntakeUgcConcept[] {
  const market = answers.market?.trim() || defaults.market?.trim() || "your local market";
  const audience = answers.targetAudience === "custom"
    ? answers.customAudience?.trim() || "buyers"
    : getAnswerLabel(answers.targetAudience, audienceOptions).toLowerCase();
  const offer = answers.offer === "custom"
    ? answers.customOffer?.trim() || defaults.offer?.trim() || "review options this week"
    : getAnswerLabel(answers.offer, offerOptions).toLowerCase();
  const cta = answers.cta?.trim() || defaults.cta?.trim() || "Book a 15-minute strategy call this week";
  const persona = answers.creatorPersona?.trim() || "trusted local real estate guide";
  const pacing = answers.pacing?.trim() || "fast hook, clear middle, calm CTA";
  const overlays = answers.captionOverlayStyle?.trim() || "large readable captions";

  return [
    {
      id: "ugc-concept-market-myth",
      title: "Market myth opener",
      hook: `Most ${audience} in ${market} are missing homes before they ever hit their search alerts.`,
      script: `${persona} opens with the market myth, explains the buyer pain, shows the matching mechanism, and closes with ${cta}.`,
      shotList: ["Direct-to-camera hook", "Local home or street context", "Readable mechanism caption", "Clear CTA close"],
      overlayPlan: `${overlays}; no tiny captions or fake dashboards.`,
      cta,
    },
    {
      id: "ugc-concept-affordability-reality-check",
      title: "Affordability reality check",
      hook: `If your budget feels tight in ${market}, stop guessing and check the right matches this week.`,
      script: `${persona} frames the affordability pain, explains ${offer}, and makes the next step feel low-pressure.`,
      shotList: ["Affordability hook", "Phone-camera walkthrough", "One proof caption", "Final CTA caption"],
      overlayPlan: `${overlays}; keep copy sparse and feed-readable.`,
      cta,
    },
    {
      id: "ugc-concept-private-shortlist",
      title: "Private shortlist walkthrough",
      hook: `Before you scroll another listing site, get a sharper ${market} shortlist built around what actually fits.`,
      script: `${persona} uses ${pacing.toLowerCase()} to explain the shortlist angle and close without sounding like a generic sample ad.`,
      shotList: ["Natural real estate setting", "Movement through context", "Shortlist mechanism caption", "Direct-to-camera CTA"],
      overlayPlan: `${overlays}; no listing-sheet UI, fake app screens, or gibberish text.`,
      cta,
    },
  ];
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
  const includesStatic = phaseIncludesStatic(answers.generationPhase);
  const includesUgcVideo = phaseIncludesUgcVideo(answers.generationPhase);
  const ugcConceptOptions = useMemo(() => {
    return phaseIncludesUgcVideo(answers.generationPhase)
      ? buildClientUgcConceptOptions(answers, defaults)
      : [];
  }, [answers, defaults]);
  const complete = useMemo(() => {
    return Boolean(
      answers.targetAudience &&
      (answers.targetAudience !== "custom" || answers.customAudience?.trim()) &&
      answers.offer &&
      (answers.offer !== "custom" || answers.customOffer?.trim()) &&
      answers.brokerageBrand &&
      (answers.brokerageBrand !== "custom" || answers.customBrokerageBrand?.trim()) &&
      answers.market?.trim() &&
      answers.creativeStyle &&
      (
        !phaseIncludesUgcVideo(answers.generationPhase) ||
        Boolean(
          (answers.referenceExamples?.trim() || answers.ugcDefaultStyleAccepted) &&
          ugcConceptOptions.some((concept) => concept.id === answers.selectedUgcConceptId)
        )
      ),
    );
  }, [answers, ugcConceptOptions]);

  function updateAnswer(next: Partial<CreativeIntakeAnswers>) {
    setAnswers((current) => ({ ...current, ...next }));
    setError(null);
    setNotice(null);
  }

  function updateGenerationPhase(nextPhase: CreativeIntakeGenerationPhase) {
    updateAnswer({
      generationPhase: nextPhase,
      creativeStyle: nextPhase === "ugc_video" ? "ugc" : answers.creativeStyle,
      selectedUgcConceptId: phaseIncludesUgcVideo(nextPhase) ? answers.selectedUgcConceptId : "",
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
                Build the Marketing Studio brief before paid rendering
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Create or revise the static and AI UGC direction here. DealFlow turns it into a structured provider brief and only renders paid media after approval.
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

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Primary call to action</span>
                <Input value={answers.cta ?? ""} onChange={(event) => updateAnswer({ cta: event.target.value })} placeholder="Book a free consult" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Placement plan</span>
                <Input
                  value={answers.platformPlacement ?? ""}
                  onChange={(event) => updateAnswer({ platformPlacement: event.target.value })}
                  placeholder="Meta feed, story, and reels"
                />
              </label>
            </div>

            <FormatChoiceGroup
              label="What are you creating now?"
              value={answers.generationPhase ?? "static_and_ugc"}
              onChange={updateGenerationPhase}
            />

            {includesStatic ? (
              <ChoiceGroup
                label="Static ad output"
                value={answers.outputMode}
                options={[
                  ["finished_ad", "Customer-ready static ad"],
                  ["background_only", "Text-free visual background"],
                ] as const}
                onChange={(outputMode) => updateAnswer({ outputMode: outputMode as CreativeIntakeAnswers["outputMode"] })}
              />
            ) : null}

            <ChoiceGroup
              label="What creative style do you want?"
              value={answers.creativeStyle}
              options={styleOptions}
              onChange={(creativeStyle) => updateAnswer({ creativeStyle: creativeStyle as CreativeIntakeAnswers["creativeStyle"] })}
            />

            {includesUgcVideo ? (
              <div className="grid gap-4 rounded-[22px] border border-cyan-300/14 bg-cyan-300/[0.045] p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">AI UGC style brief</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Save references or explicitly accept the default style before rendering. This keeps weak 5-second samples out of the launch package.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Target length</span>
                    <Input
                      type="number"
                      min={15}
                      max={30}
                      value={answers.targetDurationSeconds ?? 20}
                      onChange={(event) => updateAnswer({ targetDurationSeconds: Number(event.target.value) })}
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Creator / agent persona</span>
                    <Input value={answers.creatorPersona ?? ""} onChange={(event) => updateAnswer({ creatorPersona: event.target.value })} placeholder="Trusted local agent / buyer guide" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Hook angle</span>
                    <Input value={answers.hookAngle ?? ""} onChange={(event) => updateAnswer({ hookAngle: event.target.value })} placeholder="Most buyers miss homes that fit their budget" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Visual style</span>
                    <Input value={answers.visualStyle ?? ""} onChange={(event) => updateAnswer({ visualStyle: event.target.value })} placeholder="Native vertical social, Toronto home context" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Pacing</span>
                    <Input value={answers.pacing ?? ""} onChange={(event) => updateAnswer({ pacing: event.target.value })} placeholder="Fast hook, clear middle, calm CTA" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Camera style</span>
                    <Input value={answers.cameraStyle ?? ""} onChange={(event) => updateAnswer({ cameraStyle: event.target.value })} placeholder="Phone-camera creator POV" />
                  </label>
                </div>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Caption / overlay style</span>
                  <Input value={answers.captionOverlayStyle ?? ""} onChange={(event) => updateAnswer({ captionOverlayStyle: event.target.value })} placeholder="Large readable captions, no tiny text" />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Reference examples, links, screenshots, or notes</span>
                  <textarea
                    aria-label="UGC reference examples"
                    className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-200/30"
                    value={answers.referenceExamples ?? ""}
                    onChange={(event) => updateAnswer({ referenceExamples: event.target.value })}
                    placeholder="Paste 2-5 reference links or describe what good AI UGC should look like"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Good / bad output notes</span>
                    <textarea
                      aria-label="Good and bad UGC output notes"
                      className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-200/30"
                      value={answers.goodBadExamples ?? ""}
                      onChange={(event) => updateAnswer({ goodBadExamples: event.target.value })}
                      placeholder="Good: natural creator. Bad: stock-looking 5s clip."
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Must-use language</span>
                    <textarea
                      aria-label="UGC must-use language"
                      className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-200/30"
                      value={answers.mustUseLanguage ?? ""}
                      onChange={(event) => updateAnswer({ mustUseLanguage: event.target.value })}
                      placeholder="Book a 15-minute buyer strategy call this week"
                    />
                  </label>
                </div>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Must-avoid constraints</span>
                  <textarea
                    aria-label="UGC must-avoid constraints"
                    className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-200/30"
                    value={answers.mustAvoid ?? ""}
                    onChange={(event) => updateAnswer({ mustAvoid: event.target.value })}
                    placeholder="No sample clips, fake creator claims, fake dashboards, or guaranteed approval"
                  />
                </label>
                <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/18 p-3 text-sm leading-6 text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={answers.ugcDefaultStyleAccepted === true}
                    onChange={(event) => updateAnswer({ ugcDefaultStyleAccepted: event.target.checked })}
                  />
                  <span>I do not have references yet; use DealFlow&apos;s default 15-30 second native social UGC style for this campaign.</span>
                </label>
              </div>
            ) : null}

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
                Complete the required audience, offer, brand, market, style, and UGC reference/default-style fields, then select one UGC concept before approving. Saving a draft will not unlock paid rendering.
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
            <SummaryRow label="Placement" value={answers.platformPlacement} />
            {includesStatic ? (
              <SummaryRow label="Output mode" value={answers.outputMode === "background_only" ? "Text-free visual background" : "Customer-ready static ad"} />
            ) : null}
            <SummaryRow
              label="Studio mode"
              value={
                answers.generationPhase === "static_and_ugc"
                  ? "Static ads + AI UGC video ads"
                  : answers.generationPhase === "ugc_video"
                    ? "AI UGC video ads"
                    : "Static ads"
              }
            />
            {includesUgcVideo ? (
              <>
                <SummaryRow label="UGC length" value={`${answers.targetDurationSeconds ?? 20}s target`} />
                <SummaryRow label="UGC persona" value={answers.creatorPersona} />
                <SummaryRow label="References" value={answers.referenceExamples?.trim() ? "Reference notes saved" : answers.ugcDefaultStyleAccepted ? "Default style accepted" : "Reference needed"} />
                <SummaryRow
                  label="Selected concept"
                  value={ugcConceptOptions.find((concept) => concept.id === answers.selectedUgcConceptId)?.title ?? "Select a concept before rendering"}
                />
              </>
            ) : null}
          </div>
          {includesUgcVideo ? (
            <div className="mt-5 rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4">
              <p className="text-sm font-semibold text-foreground">Pre-render UGC concepts</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Choose the script DealFlow should render. These concepts are saved with the brief and do not spend provider credits.
              </p>
              <div className="mt-4 grid gap-3">
                {ugcConceptOptions.map((concept) => {
                  const selected = answers.selectedUgcConceptId === concept.id;
                  return (
                    <button
                      key={concept.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => updateAnswer({ selectedUgcConceptId: concept.id })}
                      className={cn(
                        "rounded-[18px] border p-3 text-left transition",
                        selected
                          ? "border-cyan-200/40 bg-cyan-300/[0.12]"
                          : "border-white/10 bg-white/[0.035] hover:border-cyan-200/24",
                      )}
                    >
                      <span className="text-sm font-semibold text-foreground">{concept.title}</span>
                      <span className="mt-2 block text-xs leading-5 text-cyan-50/78">{concept.hook}</span>
                      <span className="mt-2 block text-xs leading-5 text-muted-foreground">{concept.script}</span>
                      <span className="mt-3 inline-flex rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                        {selected ? "Selected for render" : "Select concept"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {initialIntake?.messages?.length ? (
            <div className="mt-5 rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
              <p className="text-sm font-semibold text-foreground">Marketing Studio chat log</p>
              <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
                {initialIntake.messages.slice(-8).map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-2xl px-3 py-2 text-xs leading-5",
                      message.role === "user"
                        ? "bg-cyan-300/[0.1] text-cyan-50"
                        : message.role === "assistant"
                          ? "bg-white/[0.055] text-muted-foreground"
                          : "bg-emerald-300/[0.08] text-emerald-100",
                    )}
                  >
                    {message.content}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-5 rounded-[20px] border border-emerald-300/16 bg-emerald-300/[0.055] p-4 text-sm leading-6 text-muted-foreground">
            <FileCheck2 className="mb-3 size-4 text-emerald-100" />
            This is the brief review step before generation. Save a draft to preserve the inputs, then approve only when the direction is ready.
          </div>
          <div className="mt-5 rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4 text-sm leading-6 text-muted-foreground">
            <PencilLine className="mb-3 size-4 text-cyan-100" />
            No image or video render starts from this intake. Paid rendering stays blocked until the brief is approved.
          </div>
        </aside>
      </div>
    </Card>
  );
}

function FormatChoiceGroup({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CreativeIntakeGenerationPhase;
  onChange: (value: CreativeIntakeGenerationPhase) => void;
}) {
  const staticSelected = phaseIncludesStatic(value);
  const ugcSelected = phaseIncludesUgcVideo(value);

  function toggle(kind: "static" | "ugc_video") {
    const nextStatic = kind === "static" ? !staticSelected : staticSelected;
    const nextUgc = kind === "ugc_video" ? !ugcSelected : ugcSelected;

    if (nextStatic && nextUgc) {
      onChange("static_and_ugc");
    } else if (nextUgc) {
      onChange("ugc_video");
    } else {
      onChange("static");
    }
  }

  return (
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={label}>
        {[
          ["static", "Static ads", staticSelected],
          ["ugc_video", "AI UGC video ads", ugcSelected],
        ].map(([key, title, active]) => (
          <button
            key={String(key)}
            type="button"
            aria-pressed={Boolean(active)}
            onClick={() => toggle(key as "static" | "ugc_video")}
            className={cn(
              "rounded-full border px-3 py-2 text-xs font-semibold transition",
              active
                ? "border-cyan-200/36 bg-cyan-300/[0.1] text-cyan-50"
                : "border-white/10 bg-white/[0.035] text-white/64 hover:border-cyan-200/18",
            )}
          >
            {title}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        DealFlow can prepare static image ads and AI UGC video direction from the same approved brief.
      </p>
    </div>
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
