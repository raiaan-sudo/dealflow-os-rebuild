import { assertNoUnsupportedAdClaims } from "@/lib/copy/claim-safety";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";

type StaticCreativeProviderInput = {
  creativeBrief: {
    keyOffer?: unknown;
    hooks?: unknown;
    visualDirection?: unknown;
  };
  staticAsset?: {
    hook?: unknown;
    headline?: unknown;
    primaryText?: unknown;
    cta?: unknown;
    imagePrompt?: unknown;
    imagePromptConfig?: { prompt?: unknown } | null;
  } | null;
};

type VideoGenerationClaimInput = {
  title?: unknown;
  hook?: unknown;
  body?: unknown;
  cta?: unknown;
  scriptText?: unknown;
  scriptLines?: unknown;
  scenes?: Array<{ text?: unknown }> | null;
};

type MetaCreativeClaimInput = {
  primaryText?: unknown;
  headline?: unknown;
  description?: unknown;
  cta?: unknown;
  overlayText?: unknown;
  body?: unknown;
};

type ExecutableMetaCampaignClaimInput = {
  adSets?: Array<{
    ads?: Array<{
      copy?: unknown;
      headline?: unknown;
      cta?: unknown;
      creativeAsset?: {
        overlayText?: unknown;
        headline?: unknown;
        body?: unknown;
      } | null;
    }> | null;
  }> | null;
};

function collectStrings(value: unknown, output: string[]) {
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized) output.push(normalized);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
  }
}

function assertClaimFields(values: unknown[], label: string) {
  const text: string[] = [];
  for (const value of values) collectStrings(value, text);
  assertNoUnsupportedAdClaims(text.join("\n"), label);
}

/**
 * Checks every persisted string that the public funnel renderer can expose.
 * Object keys, identifiers, URLs, internal notes, and form-field names are
 * deliberately excluded so policy matching applies only to customer copy.
 */
export function assertPublicFunnelClaims(record: FullCampaignRecord) {
  assertClaimFields(
    [
      record.campaign.name,
      record.campaign.offer,
      record.plan.offer,
      record.plan.offer_summary,
      record.funnel.headline,
      record.funnel.subheadline,
      record.funnel.cta,
      record.funnel.customLeadFormQuestions,
      ...record.funnel.sections.flatMap((section) => [
        section.title,
        section.content,
        section.media?.label,
        section.media?.caption,
      ]),
    ],
    "public funnel copy",
  );
}

/**
 * Checks persisted campaign copy before a paid static-generation job can be
 * queued or dispatched. This intentionally includes legacy draft variants so
 * an unused unsafe variant cannot later become the selected paid asset.
 */
export function assertPaidCreativeCampaignClaims(record: FullCampaignRecord) {
  assertPublicFunnelClaims(record);
  assertClaimFields(
    [
      record.plan.offer,
      record.plan.offer_summary,
      record.plan.summary,
      record.strategy.offer,
      ...record.creatives.ideas.flatMap((creative) => [
        creative.hook,
        creative.concept,
        creative.visual_direction,
      ]),
      ...record.creatives.copy.flatMap((copy) => [
        copy.hook,
        copy.primary_text,
        copy.script,
        copy.headline,
        copy.cta,
      ]),
      ...record.creatives.ads.flatMap((ad) => [
        ad.overlayText,
        ad.headline,
        ad.body,
        ad.cta,
      ]),
      ...record.creatives.items.flatMap((item) => [
        item.title,
        item.hook,
        item.overlayText,
        item.primaryText,
        item.headline,
        item.cta,
        item.concept,
        item.imagePrompt,
        item.scriptLines,
        item.onScreenText,
      ]),
      ...record.creatives.staticAds.flatMap((ad) => [
        ad.hook,
        ad.overlayText,
        ad.primaryText,
        ad.headline,
        ad.cta,
        ad.imagePrompt,
        ad.imagePromptConfig?.prompt,
      ]),
      ...record.creatives.videoAds.flatMap((video) => [
        video.title,
        video.hook,
        video.script,
        video.onScreenText,
        video.cta,
      ]),
    ],
    "paid campaign creative copy",
  );
}

/** Last-line check on the exact copy/prompt passed to a paid image provider. */
export function assertStaticCreativeProviderClaims(input: StaticCreativeProviderInput) {
  assertClaimFields(
    [
      input.creativeBrief.keyOffer,
      input.creativeBrief.hooks,
      input.creativeBrief.visualDirection,
      input.staticAsset?.hook,
      input.staticAsset?.headline,
      input.staticAsset?.primaryText,
      input.staticAsset?.cta,
      input.staticAsset?.imagePrompt,
      input.staticAsset?.imagePromptConfig?.prompt,
    ],
    "paid static creative provider input",
  );
}

/** Last-line check on the exact persisted video job payload. */
export function assertVideoGenerationClaims(input: VideoGenerationClaimInput) {
  assertClaimFields(
    [
      input.title,
      input.hook,
      input.body,
      input.cta,
      input.scriptText,
      input.scriptLines,
      input.scenes?.map((scene) => scene.text),
    ],
    "paid video creative provider input",
  );
}

/** Last-line check on the exact textual fields in a Meta creative payload. */
export function assertMetaCreativeClaims(input: MetaCreativeClaimInput) {
  assertClaimFields(
    [
      input.primaryText,
      input.headline,
      input.description,
      input.cta,
      input.overlayText,
      input.body,
    ],
    "Meta creative copy",
  );
}

/** Preflights legacy executable-campaign paths before campaign/ad-set writes. */
export function assertExecutableMetaCampaignClaims(input: ExecutableMetaCampaignClaimInput) {
  for (const adSet of input.adSets ?? []) {
    for (const ad of adSet.ads ?? []) {
      assertMetaCreativeClaims({
        primaryText: ad.copy,
        headline: ad.headline,
        cta: ad.cta,
        overlayText: ad.creativeAsset?.overlayText,
        body: ad.creativeAsset?.body,
      });
    }
  }
}
