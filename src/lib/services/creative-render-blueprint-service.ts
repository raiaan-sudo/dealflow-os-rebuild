import type {
  CaptionSegment,
  CreativeAssetFormat,
  CreativeProductionPlan,
  RenderBlueprint,
  RenderBlueprintScene,
} from "@/lib/types/creative-assets";

function splitScriptIntoPhrases(script: string) {
  return script
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function segmentCaptions(script: string): CaptionSegment[] {
  const parts = splitScriptIntoPhrases(script);
  let offset = 0;

  return parts.map((part, index) => {
    const durationMs = Math.max(1800, Math.min(4200, part.length * 65));
    const segment = {
      id: `caption_${index + 1}`,
      text: part,
      startMs: offset,
      endMs: offset + durationMs,
    };
    offset += durationMs;
    return segment;
  });
}

function buildOverlayText(value: string) {
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
}

function buildBaseScenes(plan: CreativeProductionPlan, format: CreativeAssetFormat): RenderBlueprintScene[] {
  const captions = segmentCaptions(plan.normalizedScript.script);

  return captions.map((caption, index) => ({
    id: `scene_${index + 1}`,
    type:
      index === 0
        ? "hook"
        : index === captions.length - 1
          ? "cta"
          : index === 1
            ? "benefit"
            : "proof",
    text: caption.text,
    durationMs: caption.endMs - caption.startMs,
    overlayText: buildOverlayText(caption.text),
    imagePrompt:
      plan.assetType === "talking_head_video"
        ? null
        : {
            prompt:
              `${plan.creative.concept}. ${plan.creative.visual_direction}. ` +
              `Audience: ${plan.metadata.audience ?? ""}. Offer: ${plan.metadata.offer ?? ""}.`,
            negativePrompt: "low quality, distorted faces, surreal, text-heavy",
            style: plan.assetType === "montage_video" ? "realistic" : "graphic",
            aspectRatio: format,
          },
  }));
}

export function createRenderBlueprint(
  plan: CreativeProductionPlan,
  format: CreativeAssetFormat,
): RenderBlueprint {
  const captions = segmentCaptions(plan.normalizedScript.script);
  const frames = buildBaseScenes(plan, format);

  return {
    aspectRatio: format,
    headline: plan.normalizedScript.headline,
    cta: plan.normalizedScript.cta,
    frames,
    captions,
    voiceoverTrack: {
      script: plan.normalizedScript.script,
      config: plan.voiceoverConfig,
    },
    ctaOutro: {
      text: plan.normalizedScript.cta,
      durationMs: 2200,
    },
  };
}

export function createRenderBlueprintsForPlan(
  plan: Omit<CreativeProductionPlan, "renderBlueprints">,
): RenderBlueprint[] {
  return plan.formats.map((format) =>
    createRenderBlueprint(plan as CreativeProductionPlan, format),
  );
}
