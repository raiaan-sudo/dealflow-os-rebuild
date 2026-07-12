// @ts-nocheck
import { type CreativeBrief } from "@/lib/ai/creative-brief";
import { getImageGenerationEnv, getVideoGenerationEnv } from "@/lib/env";
import { getImageGenerationProvider } from "@/lib/integrations/creative/image-provider";
import { logWarn } from "@/lib/logging";
import type { StaticCreativeAsset } from "@/lib/services/creative-engine";

export type AvatarProfile = {
  id: "young_agent" | "trusted_expert" | "ugc_casual";
  genderPresentation: string;
  ageRange: string;
  stylePersona: string;
  energy: string;
  nicheFit: string;
};

export type VoiceProfile = {
  id: "confident" | "friendly" | "authoritative";
  tone: string;
  accent: string;
  speed: string;
  authorityLevel: string;
};

export type ImageAdResult = {
  imageUrl: string | null;
  overlayText: string;
  headline: string;
  primaryText: string;
  cta: string;
  generationState: "generated" | "unavailable" | "failed";
  generationMessage: string | null;
  generationModel: string | null;
};

export type ImageProviderUsageContext = {
  reserve: () => Promise<{
    eventId: string | null | undefined;
    organizationId: string;
    userId: string;
    settlementToken: string | null | undefined;
    settlementGeneration: number | null | undefined;
  }>;
  mark: (params: {
    eventId: string | null | undefined;
    organizationId: string;
    userId: string;
    settlementToken: string | null | undefined;
    settlementGeneration: number | null | undefined;
    status: "consumed" | "released" | "rejected" | "operator_action_required";
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
};

export type VideoScene = {
  title: string;
  description: string;
};

export type VideoAdResult = {
  hook: string;
  script: string[];
  scenes: VideoScene[];
  videoUrl?: string;
  avatar: AvatarProfile;
  voice: VoiceProfile;
};

export type HeyGenVideoRequest = {
  avatar_id: string;
  script: string;
  voice: string;
  title?: string;
};

export type HeyGenVideoResult = {
  url: string;
  providerAssetId: string | null;
  providerName: "heygen" | null;
};

function safeText(input: unknown): string {
  if (input === null || input === undefined) {
    return "";
  }

  return String(input).trim();
}

function toSlug(value: string) {
  return safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildMockVideoUrl(seed = "generated-video") {
  return `/mock-assets/video/${toSlug(seed) || "generated-video"}.mp4`;
}

function defaultAvatarProfile(brief: CreativeBrief): AvatarProfile {
  if (/first|new|starter/i.test(brief.audience)) {
    return {
      id: "young_agent",
      genderPresentation: "approachable professional",
      ageRange: "26-34",
      stylePersona: "young local agent",
      energy: "upbeat",
      nicheFit: `${brief.audience} in ${brief.location}`,
    };
  }

  if (/investor|investment|cashflow/i.test(brief.audience)) {
    return {
      id: "trusted_expert",
      genderPresentation: "polished professional",
      ageRange: "35-50",
      stylePersona: "trusted real estate expert",
      energy: "calm and decisive",
      nicheFit: `${brief.audience} in ${brief.location}`,
    };
  }

  return {
    id: "ugc_casual",
    genderPresentation: "friendly relatable",
    ageRange: "28-40",
    stylePersona: "casual UGC creator",
    energy: "warm and conversational",
    nicheFit: `${brief.audience} in ${brief.location}`,
  };
}

function defaultVoiceProfile(brief: CreativeBrief): VoiceProfile {
  if (/first|new|starter/i.test(brief.audience)) {
    return {
      id: "friendly",
      tone: "friendly and reassuring",
      accent: "local neutral",
      speed: "medium",
      authorityLevel: "medium",
    };
  }

  if (/investor|investment|cashflow/i.test(brief.audience)) {
    return {
      id: "authoritative",
      tone: "authoritative and sharp",
      accent: "local neutral",
      speed: "measured",
      authorityLevel: "high",
    };
  }

  return {
    id: "confident",
    tone: "confident and clear",
    accent: "local neutral",
    speed: "medium",
    authorityLevel: brief.scriptStyle === "authority" ? "high" : "medium",
  };
}

export function selectAvatarProfile(brief: CreativeBrief): AvatarProfile {
  return defaultAvatarProfile(brief);
}

export function selectVoiceProfile(brief: CreativeBrief): VoiceProfile {
  return defaultVoiceProfile(brief);
}

function buildStoryboardScript(creativeBrief: CreativeBrief) {
  const market = safeText(creativeBrief.location) || "your market";
  const audience = safeText(creativeBrief.audience) || "buyers";
  const offer = safeText(creativeBrief.keyOffer) || "a stronger offer";
  const pain = safeText(creativeBrief.painPoints[0]) || "wasting time on the wrong opportunities";
  const mechanism = safeText(creativeBrief.mechanism)
    || `We filter ${market} opportunities around your actual criteria so you move faster with more conviction.`;

  const hook =
    creativeBrief.scriptStyle === "ugc"
      ? `If you want ${offer} in ${market}, this is the move most ${audience} miss.`
      : creativeBrief.scriptStyle === "authority"
        ? `${audience} in ${market} are losing time on the wrong deals.`
        : `Most ${audience} wait too long and miss ${offer} in ${market}.`;

  const problem =
    /seller/i.test(audience) || /sell|seller/i.test(offer)
      ? `Most sellers sit too long because the wrong buyers see the property first.`
      : /approv|credit|mortgage|deposit|down/i.test(offer)
        ? `Most ${audience} get stuck because they chase listings before they know what they can actually qualify for.`
        : `Most ${audience} lose momentum because they keep looking at opportunities that never match the real goal.`;

  const offerLine =
    /cash ?flow|invest/i.test(offer)
      ? `We help you find investor-grade opportunities in ${market} built around ${offer}.`
      : /off-market/i.test(offer)
        ? `We help you access off-market opportunities in ${market} before they get crowded.`
        : /approv|credit|mortgage|deposit|down/i.test(offer)
          ? `We help you move toward ${offer} without the usual friction or guesswork.`
          : /seller/i.test(audience) || /sell|seller/i.test(offer)
            ? `We help you turn ${offer} into a real selling plan with serious buyer demand behind it.`
            : `We help you move on ${offer} faster in ${market}.`;

  const cta =
    /cash ?flow|invest/i.test(offer)
      ? "See available cash-flow deals now."
      : /off-market/i.test(offer)
        ? "View off-market opportunities now."
        : /approv|credit|mortgage|deposit|down/i.test(offer)
          ? "See if you qualify now."
          : /seller/i.test(audience) || /sell|seller/i.test(offer)
            ? "See your sale plan now."
            : "See what is available now.";

  return [
    hook,
    `${problem} ${mechanism} ${offerLine}`.replace(/\s+/g, " ").trim(),
    cta,
  ];
}

function buildStoryboardScenes(script: string[], creativeBrief: CreativeBrief): VideoScene[] {
  const propertyType = safeText(creativeBrief.propertyType) || "property";
  const visualDirection = safeText(creativeBrief.visualDirection) || "clean, premium real estate visuals";
  const [hook, body, cta] = script;

  return [
    {
      title: "Hook",
      description: `Creator opens to camera with: "${safeText(hook)}" over ${visualDirection} and a fast cut of the featured ${propertyType}.`,
    },
    {
      title: "Body",
      description: `Show supporting footage while the creator explains: "${safeText(body)}" with market-specific visuals and proof-style framing.`,
    },
    {
      title: "CTA",
      description: `Return to direct eye contact and close with: "${safeText(cta)}" as the on-screen call to act now.`,
    },
  ].filter((scene) => safeText(scene.description).length > 12);
}

export async function createImageAd(
  creativeBrief: CreativeBrief,
  staticAsset?: Pick<
    StaticCreativeAsset,
    "imagePrompt" | "imagePromptConfig" | "preferredImageModel" | "hook" | "headline" | "primaryText" | "cta"
  > | null,
  providerUsage?: ImageProviderUsageContext | null,
): Promise<ImageAdResult> {
  const market = safeText(creativeBrief.location) || "your market";
  const audience = safeText(creativeBrief.audience) || "local buyers";
  const offer = safeText(creativeBrief.keyOffer) || "a stronger offer";
  const hook = staticAsset?.hook || creativeBrief.hooks[0] || `${market} ${audience}: ${offer}`;
  let imageUrl: string | null = null;
  let generationState: ImageAdResult["generationState"] = "unavailable";
  let generationMessage: string | null = null;
  let generationModel: string | null = null;
  const imageProvider = getImageGenerationProvider();

  if (imageProvider.isConfigured()) {
    let budgetReservation: Awaited<ReturnType<ImageProviderUsageContext["reserve"]>> | null = null;
    try {
      if (process.env.ALLOW_OPENAI_IMAGE_GENERATION === "true" && !providerUsage) {
        throw new Error(
          "provider_usage_reservation_required: OpenAI image generation requires a durable provider-usage reservation.",
        );
      }
      if (process.env.ALLOW_OPENAI_IMAGE_GENERATION === "true" && providerUsage) {
        budgetReservation = await providerUsage.reserve();
      }

      const result = await imageProvider.execute({
        aspectRatio: staticAsset?.imagePromptConfig?.aspectRatio ?? "1:1",
        model: staticAsset?.preferredImageModel ?? getImageGenerationEnv()?.model ?? "gpt-image-1.5",
        prompt:
          staticAsset?.imagePromptConfig?.prompt ??
          staticAsset?.imagePrompt ??
          `A modern real estate ad image for ${audience} in ${market}. Scene: ${creativeBrief.visualDirection}. Style: clean, bright, premium, realistic. No text in image.`,
        negativePrompt: staticAsset?.imagePromptConfig?.negativePrompt ?? null,
      });
      const parsed = imageProvider.parseResult(result);

      if (parsed.fileUrl) {
        imageUrl = parsed.fileUrl;
        generationState = "generated";
        generationModel =
          typeof parsed.metadata?.model === "string" ? parsed.metadata.model : null;
        if (providerUsage && budgetReservation) {
          await providerUsage.mark({
            ...budgetReservation,
            status: "consumed",
            metadata: {
              operation: "openai_image_generation",
              assetId: staticAsset?.hook ?? null,
              model: generationModel,
            },
          });
        }
      } else {
        generationState = parsed.status === "unsupported" ? "unavailable" : "failed";
        generationMessage = parsed.error ?? "Image generation did not return a usable asset.";
        if (providerUsage && budgetReservation) {
          const providerOutcome = parsed.metadata?.providerOutcome;
          await providerUsage.mark({
            ...budgetReservation,
            status:
              parsed.status === "unsupported"
                ? "released"
                : providerOutcome === "rejected"
                  ? "rejected"
                  : "operator_action_required",
            metadata: {
              operation: "openai_image_generation",
              assetId: staticAsset?.hook ?? null,
              reason: generationMessage,
              providerOutcome:
                typeof providerOutcome === "string" ? providerOutcome : "ambiguous",
            },
          });
        }
      }
    } catch (error) {
      generationState = "failed";
      generationMessage = error instanceof Error ? error.message : "Unknown image generation error.";
      if (providerUsage && budgetReservation) {
        await providerUsage.mark({
          ...budgetReservation,
          status: "operator_action_required",
          metadata: {
            operation: "openai_image_generation",
            assetId: staticAsset?.hook ?? null,
            reason: generationMessage,
            providerOutcome: "ambiguous",
          },
        }).catch(() => null);
      }
      logWarn("OpenAI image generation failed", {
        message: error instanceof Error ? error.message : "Unknown error",
        location: market,
        audience,
      });
    }
  } else {
    const validation = imageProvider.validateConfig();
    generationMessage =
      validation.missingConfig.length > 0
        ? `Image generation is not configured. Missing: ${validation.missingConfig.join(", ")}.`
        : "Image generation is not configured.";
  }

  return {
    imageUrl,
    overlayText: hook,
    headline: staticAsset?.headline || `Get ${offer} in ${market}`.trim(),
    primaryText: staticAsset?.primaryText || `${audience} in ${market} can move faster with ${offer}.`,
    cta: staticAsset?.cta || "Get My List",
    generationState,
    generationMessage,
    generationModel,
  };
}

export async function createHeyGenVideo({
  script,
  title,
}: HeyGenVideoRequest): Promise<HeyGenVideoResult> {
  const safeScript = safeText(script);
  const url = buildMockVideoUrl(title ?? safeScript.slice(0, 32));

  if (!safeScript || safeScript.length < 10) {
    return {
      url,
      providerAssetId: null,
      providerName: null,
    };
  }

  if (process.env.ALLOW_HEYGEN_VIDEO_GENERATION === "true") {
    logWarn("Unreserved legacy HeyGen generation was blocked", {
      reason: "provider_usage_reservation_required",
      title,
    });
  }

  return {
    url,
    providerAssetId: null,
    providerName: null,
  };
}

export async function createVideoAd(
  creativeBrief: CreativeBrief,
  avatarProfile?: AvatarProfile,
  voiceProfile?: VoiceProfile,
): Promise<VideoAdResult> {
  const market = safeText(creativeBrief.location) || "your market";
  const audience = safeText(creativeBrief.audience) || "local buyers";
  const offer = safeText(creativeBrief.keyOffer) || "a stronger offer";
  const pain = creativeBrief.painPoints[0] ?? "moving too slowly";
  const avatar = avatarProfile ?? defaultAvatarProfile(creativeBrief);
  const voice = voiceProfile ?? defaultVoiceProfile(creativeBrief);
  const hook = creativeBrief.hooks[1] ?? `Stop ${pain}`;
  const safeScript = buildStoryboardScript(creativeBrief)
    .map((line) => safeText(line))
    .filter((line) => line.length > 3);
  const script =
    safeScript.length > 0
      ? safeScript
      : [
          "Most people miss the strongest opportunities because they move too late",
          "We filter the market around the offer so the best options show up first",
          "See what is available now",
        ];
  const scenes = buildStoryboardScenes(script, creativeBrief);
  const videoEnv = getVideoGenerationEnv();
  const apiKey = videoEnv?.apiKey;
  const avatarId = videoEnv?.avatarId ?? "";
  const voiceId = videoEnv?.voiceId ?? "";
  let videoUrl = buildMockVideoUrl(`${market}-${audience}-${offer}`);

  if (process.env.ALLOW_HEYGEN_VIDEO_GENERATION === "true" && apiKey && avatarId && voiceId) {
    const generatedVideo = await createHeyGenVideo({
      avatar_id: avatarId,
      script: script.join("\n"),
      voice: voiceId,
      title: `${market} ${audience} UGC ad`,
    });
    videoUrl = generatedVideo.url;
  }

  return {
    hook,
    script,
    scenes,
    videoUrl,
    avatar,
    voice,
  };
}
