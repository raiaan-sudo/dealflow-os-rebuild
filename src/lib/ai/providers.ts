// @ts-nocheck
import { type CreativeBrief } from "@/lib/ai/creative-brief";
import {
  selectAvatarProfile,
  selectVoiceProfile,
  type AvatarProfile,
  type VoiceProfile,
} from "@/lib/ai/avatar-profile";
import { getImageGenerationEnv, getMediaGenerationProvider, getVideoGenerationEnv } from "@/lib/env";
import { getAvatarVideoProvider } from "@/lib/integrations/creative/avatar-provider";
import { getImageGenerationProvider } from "@/lib/integrations/creative/image-provider";
import { logWarn } from "@/lib/logging";
import type { StaticCreativeAsset } from "@/lib/services/creative-engine";

export type { AvatarProfile, VoiceProfile } from "@/lib/ai/avatar-profile";
export { selectAvatarProfile, selectVoiceProfile } from "@/lib/ai/avatar-profile";

export type ImageAdResult = {
  imageUrl: string | null;
  overlayText: string;
  headline: string;
  primaryText: string;
  cta: string;
  generationState: "generated" | "unavailable" | "failed";
  generationMessage: string | null;
  generationModel: string | null;
  generationProvider: string | null;
};

export type ImageProviderUsageContext = {
  reserve: () => Promise<{ eventId: string | null | undefined }>;
  mark: (params: {
    eventId: string | null | undefined;
    status: "consumed" | "released" | "failed";
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
  providerName: string | null;
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
  let generationProvider: string | null = null;
  const imageProvider = getImageGenerationProvider();
  const mediaProvider = getMediaGenerationProvider();
  const imageGenerationEnabled =
    mediaProvider === "higgsfield" || mediaProvider === "higgsfield_marketing_studio"
      ? process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION === "true"
      : process.env.ALLOW_OPENAI_IMAGE_GENERATION === "true";

  if (imageGenerationEnabled && !providerUsage) {
    generationState = "failed";
    generationMessage = "AI image rendering requires an approved credit reservation.";
  } else if (imageGenerationEnabled && imageProvider.isConfigured()) {
    let budgetReservation: { eventId: string | null | undefined } | null = null;
    try {
      budgetReservation = await providerUsage?.reserve() ?? null;

      const configuredPrompt = staticAsset?.imagePromptConfig?.prompt ?? staticAsset?.imagePrompt ?? null;
      const configuredNegativePrompt = staticAsset?.imagePromptConfig?.negativePrompt ?? null;
      const marketingStudioPrompt = configuredPrompt ?? [
        "TEXT-FREE PREMIUM REAL ESTATE VISUAL BACKGROUND ONLY.",
        `Create a premium photographic real estate background for ${audience} in ${market}.`,
        `Use this offer only as visual direction, not visible text: ${offer}.`,
        `Scene: ${creativeBrief.visualDirection || hook}.`,
        "DealFlow will compose the exact headline, offer, brand, proof chips, and CTA after generation.",
        "Do not render text, captions, CTA, buttons, logos, flyers, posters, UI, dashboards, tables, listing sheets, fake forms, or typography.",
      ].join(" ");
      const backgroundOnlyPrompt =
        configuredPrompt ??
        `A modern real estate ad image for ${audience} in ${market}. Scene: ${creativeBrief.visualDirection}. Style: clean, bright, premium, realistic. No text in image.`;
      const result = await imageProvider.execute({
        aspectRatio: staticAsset?.imagePromptConfig?.aspectRatio ?? "1:1",
        model:
          imageProvider.name === "higgsfield" || imageProvider.name === "higgsfield_marketing_studio"
            ? undefined
            : staticAsset?.preferredImageModel ?? getImageGenerationEnv()?.model ?? "gpt-image-1.5",
        prompt: imageProvider.name === "higgsfield_marketing_studio" ? marketingStudioPrompt : backgroundOnlyPrompt,
        negativePrompt: imageProvider.name === "higgsfield_marketing_studio"
          ? configuredNegativePrompt ?? "text; captions; letters; numbers; words; logo; CTA button; flyer; poster; fake dashboard; listing sheet; chart; table; UI screenshot; unreadable typography"
          : configuredNegativePrompt,
      });
      const parsed = imageProvider.parseResult(result);

      if (parsed.fileUrl) {
        imageUrl = parsed.fileUrl;
        generationState = "generated";
        generationProvider = imageProvider.name;
        generationModel =
          typeof parsed.metadata?.model === "string" ? parsed.metadata.model : null;
        await providerUsage?.mark({
          eventId: budgetReservation?.eventId,
          status: "consumed",
          metadata: {
            operation: "image_generation",
            provider: imageProvider.name,
            assetId: staticAsset?.hook ?? null,
            model: generationModel,
          },
        });
      } else {
        generationState = parsed.status === "unsupported" ? "unavailable" : "failed";
        generationMessage = parsed.error ?? "Image generation did not return a usable asset.";
        const providerJobWasCreated =
          typeof parsed.providerAssetId === "string" && parsed.providerAssetId.trim().length > 0;
        await providerUsage?.mark({
          eventId: budgetReservation?.eventId,
          status: parsed.status === "unsupported" || !providerJobWasCreated ? "released" : "failed",
          metadata: {
            operation: "image_generation",
            provider: imageProvider.name,
            assetId: staticAsset?.hook ?? null,
            reason: generationMessage,
          },
        });
      }
    } catch (error) {
      generationState = "failed";
      generationMessage = error instanceof Error ? error.message : "Unknown image generation error.";
      await providerUsage?.mark({
        eventId: budgetReservation?.eventId,
        status: "failed",
        metadata: {
          operation: "image_generation",
          provider: imageProvider.name,
          assetId: staticAsset?.hook ?? null,
          reason: generationMessage,
        },
      }).catch(() => null);
      logWarn("AI image generation failed", {
        message: error instanceof Error ? error.message : "Unknown error",
        location: market,
        audience,
      });
    }
  } else {
    const validation = imageProvider.validateConfig();
    generationMessage =
      !imageGenerationEnabled
        ? "AI image rendering is not enabled for this workspace yet."
        : validation.missingConfig.length > 0
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
    generationProvider,
  };
}

export async function createHeyGenVideo({
  script,
  title,
}: HeyGenVideoRequest): Promise<HeyGenVideoResult> {
  const safeScript = safeText(script);
  let url = buildMockVideoUrl(title ?? safeScript.slice(0, 32));
  let providerAssetId: string | null = null;
  const avatarProvider = getAvatarVideoProvider();
  const videoGenerationEnabled =
    getMediaGenerationProvider() === "higgsfield" || getMediaGenerationProvider() === "higgsfield_marketing_studio"
      ? process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION === "true"
      : process.env.ALLOW_HEYGEN_VIDEO_GENERATION === "true";

  if (!safeScript || safeScript.length < 10) {
    return {
      url,
      providerAssetId,
      providerName: null,
    };
  }

  if (!videoGenerationEnabled) {
    return {
      url,
      providerAssetId,
      providerName: null,
    };
  }

  if (avatarProvider.isConfigured()) {
    try {
      const result = await avatarProvider.execute({
        aspectRatio: "9:16",
        script: safeScript,
        prompt: safeScript,
        title,
      });
      const parsed = avatarProvider.parseResult(result);
      if (parsed.providerAssetId) {
        providerAssetId = parsed.providerAssetId;
      }
      if (parsed.fileUrl) {
        url = parsed.fileUrl;
      }
    } catch (error) {
      logWarn("AI video generation threw", {
        message: error instanceof Error ? error.message : "Unknown error",
        title,
      });
    }
  }

  return {
    url,
    providerAssetId,
    providerName: avatarProvider.isConfigured() ? avatarProvider.name : null,
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

  const videoGenerationEnabled =
    getMediaGenerationProvider() === "higgsfield" || getMediaGenerationProvider() === "higgsfield_marketing_studio"
      ? process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION === "true"
      : process.env.ALLOW_HEYGEN_VIDEO_GENERATION === "true" && Boolean(apiKey && avatarId && voiceId);

  if (videoGenerationEnabled) {
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
