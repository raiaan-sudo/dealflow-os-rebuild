import { ApiError } from "@/lib/api/route";
import { logError } from "@/lib/logging";
import { getAppContext } from "@/lib/services/app-context";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import {
  logCreativeAssetFailure,
  logCreativeAssetInfo,
  logCreativeAssetStarted,
  logCreativeAssetSuccess,
} from "@/lib/services/creative-asset-log-service";
import {
  createRenderBlueprintsForPlan,
} from "@/lib/services/creative-render-blueprint-service";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import type {
  CampaignCopy,
  CampaignCreative,
  CampaignFunnel,
  FullCampaignRecord,
} from "@/lib/types/campaign-records";
import type {
  CampaignCreativeAssetRecord,
  CreativeAsset,
  CreativeAssetFormat,
  CreativeBuildInput,
  CreativeBuildResult,
  CreativeProductionPlan,
  CreativeRenderJob,
  ImagePromptConfig,
  LaunchReadyCreativeMedia,
  RenderBlueprint,
} from "@/lib/types/creative-assets";
import { getImageGenerationProvider } from "@/lib/integrations/creative/image-provider";
import { getVoiceProvider } from "@/lib/integrations/creative/voice-provider";
import { getAvatarVideoProvider } from "@/lib/integrations/creative/avatar-provider";
import type { StaticCreativeAsset } from "@/lib/services/creative-engine";
import { evaluateStaticVisualAssetDecision } from "@/lib/services/static-creative-visual-qa";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

type Pairing = {
  creative: CampaignCreative;
  copy: CampaignCopy;
};

type BuildOptions = Omit<CreativeBuildInput, "campaign_id">;

type BuildContext = {
  supabase: SupabaseClient;
  userId: string;
  campaignId: string;
};

type AssetBuildArtifacts = {
  assets: CreativeAsset[];
  jobs: CreativeRenderJob[];
};

const MANUAL_MEDIA_BUCKET = "creative-assets";
type ManualCreativeAssetKind = "video" | "image" | "thumbnail";
type VerifiedManualMediaType = {
  contentType: string;
  extension: string;
};

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, start: number, length: number) {
  return Array.from(bytes.slice(start, start + length))
    .map((value) => String.fromCharCode(value))
    .join("");
}

export function detectManualCreativeMediaType(bytes: Uint8Array, kind: ManualCreativeAssetKind): VerifiedManualMediaType {
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", extension: "png" };
  }

  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }

  if (asciiAt(bytes, 0, 6) === "GIF87a" || asciiAt(bytes, 0, 6) === "GIF89a") {
    return { contentType: "image/gif", extension: "gif" };
  }

  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }

  if (kind === "video") {
    if (asciiAt(bytes, 4, 4) === "ftyp") {
      const brand = asciiAt(bytes, 8, 4).toLowerCase();
      return {
        contentType: brand.includes("qt") ? "video/quicktime" : "video/mp4",
        extension: brand.includes("qt") ? "mov" : "mp4",
      };
    }

    if (startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
      return { contentType: "video/webm", extension: "webm" };
    }
  }

  throw new ApiError(415, "Creative asset bytes do not match a supported media type.", "creative_asset_type_unsupported");
}

async function verifyManualCreativeFile(params: {
  file: File;
  kind: ManualCreativeAssetKind;
  allowedTypes: Set<string>;
}) {
  const bytes = new Uint8Array(await params.file.arrayBuffer());
  const detected = detectManualCreativeMediaType(bytes.slice(0, 32), params.kind);

  if (!params.allowedTypes.has(detected.contentType)) {
    throw new ApiError(415, "Creative asset type is not supported.", "creative_asset_type_unsupported");
  }

  if (params.file.type && params.file.type !== detected.contentType) {
    throw new ApiError(415, "Creative asset type does not match the uploaded file.", "creative_asset_type_mismatch");
  }

  return {
    bytes,
    ...detected,
  };
}

function isLaunchReadyStaticImageAsset(asset: CreativeAsset) {
  const metadata =
    asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? (asset.metadata as Record<string, unknown>)
      : {};
  const source = typeof metadata.source === "string" ? metadata.source : null;
  const generationMethod = typeof asset.generation_method === "string" ? asset.generation_method : null;
  const isStaticGeneratedAsset =
    source === "static_ad" ||
    (generationMethod === "image_generation" && (asset.asset_type === "image_frame" || asset.asset_type === "thumbnail"));

  if (!isStaticGeneratedAsset) {
    return true;
  }

  const decision = evaluateStaticVisualAssetDecision({
    imageUrl: asset.file_url ?? asset.thumbnail_url,
    imagePrompt: typeof metadata.imagePrompt === "string" ? metadata.imagePrompt : null,
    imagePromptConfig: (metadata.imagePromptConfig ?? null) as StaticCreativeAsset["imagePromptConfig"],
    visualPromptBrief: (metadata.visualPromptBrief ?? null) as StaticCreativeAsset["visualPromptBrief"],
    qualityGate: (metadata.qualityGate ?? null) as StaticCreativeAsset["qualityGate"],
  });

  return decision.usable;
}

function mapFormatDefault(formats?: CreativeAssetFormat[] | null): CreativeAssetFormat[] {
  return formats && formats.length > 0 ? formats : ["9:16"];
}

function normalizeAspectRatio(format: CreativeAssetFormat): ImagePromptConfig["aspectRatio"] {
  return format === "1:1" || format === "4:5" || format === "16:9" ? format : "9:16";
}

async function requireCreativeBuilderContext(expectedUserId?: string) {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for creative building.", "unauthorized");
  }

  if (expectedUserId && context.user.id !== expectedUserId) {
    throw new ApiError(403, "Creative builder user mismatch.", "forbidden");
  }

  return {
    context,
    supabase,
    userId: context.user.id,
  };
}

function determineAssetType(format: CampaignCreative["format"]) {
  if (format === "ugc") {
    return "ugc_video" as const;
  }

  if (format === "montage") {
    return "montage_video" as const;
  }

  return "talking_head_video" as const;
}

function createPlanMetadata(
  creative: CampaignCreative,
  copy: CampaignCopy,
  record: FullCampaignRecord,
) {
  return {
    audience: record.strategy.audience,
    offer: record.strategy.offer,
    location: record.strategy.location,
    market_type: record.strategy.market_type ?? "buyer",
    hook: creative.hook,
    concept: creative.concept,
    headline: copy.headline,
  };
}

function matchCreativeCopyPairs(
  record: FullCampaignRecord,
  options: BuildOptions,
): Pairing[] {
  const creatives = options.selected_creative_ids?.length
    ? record.creatives.ideas.filter((creative) => options.selected_creative_ids?.includes(creative.id))
    : record.creatives.ideas;

  const copyPool = options.selected_copy_ids?.length
    ? record.creatives.copy.filter((copy) => options.selected_copy_ids?.includes(copy.id))
    : record.creatives.copy;

  if (creatives.length === 0) {
    throw new ApiError(400, "No campaign creatives are available for asset building.", "creative_missing");
  }

  if (copyPool.length === 0) {
    throw new ApiError(400, "No campaign copy assets are available for asset building.", "copy_missing");
  }

  return (creatives || []).filter(Boolean).map((creative, index) => {
    const creativeHook = (creative?.hook ?? "").trim().toLowerCase();
    const byHook = copyPool.find((copy) => (copy.hook ?? "").trim().toLowerCase() === creativeHook);
    const byIndex = copyPool[index] ?? null;
    const matched = byHook ?? byIndex;

    if (!matched) {
      throw new ApiError(
        400,
        `Creative "${creative?.hook ?? ""}" could not be matched with a copy asset safely.`,
        "creative_copy_mismatch",
      );
    }

    return {
      creative,
      copy: matched,
    };
  });
}

function buildImagePrompt(
  creative: CampaignCreative,
  record: FullCampaignRecord,
  format: CreativeAssetFormat,
) {
  const location = record.strategy.location ? `in ${record.strategy.location}` : "";
  const audience = record.strategy.audience ? `for ${record.strategy.audience}` : "";

  return {
    prompt:
      `${creative.concept}. ${creative.visual_direction}. Real estate ad visual ${location} ${audience}. ` +
      `Modern, realistic, performance-focused, clean composition, social ad ready.`,
    negativePrompt: "surreal, fantasy, distorted architecture, text-heavy poster, blurry, low quality",
    style: creative.format === "ugc" ? "graphic" : "realistic",
    aspectRatio: normalizeAspectRatio(format),
  } as const;
}

export function planCreativeProduction(
  creativeRecord: CampaignCreative,
  copyRecord: CampaignCopy,
  funnelRecord: CampaignFunnel | null,
  record: FullCampaignRecord,
  options: BuildOptions,
): CreativeProductionPlan {
  const formats = mapFormatDefault(options.formats);
  const script = (copyRecord.script ?? "").trim() || (copyRecord.primary_text ?? "").trim();

  if (!script) {
    throw new ApiError(
      400,
      `Creative "${creativeRecord.hook ?? ""}" is missing a usable script.`,
      "script_missing",
    );
  }

  const basePlan = {
    creative: creativeRecord,
    copy: copyRecord,
    funnel: funnelRecord,
    assetType: determineAssetType(creativeRecord.format),
    formats,
    normalizedScript: {
      hook: (creativeRecord.hook ?? "").trim(),
      script,
      headline: (copyRecord.headline ?? "").trim(),
      cta: (copyRecord.cta ?? "").trim() || (funnelRecord?.cta ?? "").trim() || "Learn more",
    },
    voiceoverConfig: {
      profile: options.voice_profile ?? null,
      provider: null,
      speed: 1,
      tone: creativeRecord.angle === "authority" ? "confident" : "warm",
    },
    thumbnailPrompt: options.generate_thumbnails
      ? buildImagePrompt(creativeRecord, record, formats[0])
      : null,
    metadata: createPlanMetadata(creativeRecord, copyRecord, record),
  } satisfies Omit<CreativeProductionPlan, "renderBlueprints">;

  return {
    ...basePlan,
    renderBlueprints: createRenderBlueprintsForPlan(basePlan),
  };
}

async function createAssetRow(
  context: BuildContext,
  input: Database["public"]["Tables"]["creative_assets"]["Insert"],
) {
  const payload = input;
  const { data, error } = await context.supabase
    .from("creative_assets")
    .insert(input as never)
    .select("*")
    .single();

  if (error || !data) {
    if (error) {
      logError("Creative asset insert failed", {
        campaignId: context.campaignId,
        userId: context.userId,
        assetType: input.asset_type ?? null,
        message: error.message,
        code: error.code ?? null,
      });
    }
    throw error ?? new ApiError(500, "Creative asset record could not be created.", "creative_asset_create_failed");
  }

  return data as CreativeAsset;
}

async function updateAssetRow(
  context: BuildContext,
  assetId: string,
  input: Database["public"]["Tables"]["creative_assets"]["Update"],
) {
  const { error } = await context.supabase
    .from("creative_assets")
    .update(input as never)
    .eq("id", assetId);

  if (error) {
    logError("Creative asset update failed", {
      campaignId: context.campaignId,
      userId: context.userId,
      assetId,
      message: error.message,
      code: error.code ?? null,
    });
    throw error;
  }
}

async function createRenderJobRow(
  context: BuildContext,
  input: Database["public"]["Tables"]["creative_render_jobs"]["Insert"],
) {
  const { data, error } = await context.supabase
    .from("creative_render_jobs")
    .insert(input as never)
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new ApiError(500, "Creative render job could not be created.", "render_job_create_failed");
  }

  return data as CreativeRenderJob;
}

async function updateRenderJobRow(
  context: BuildContext,
  jobId: string,
  input: Database["public"]["Tables"]["creative_render_jobs"]["Update"],
) {
  const { error } = await context.supabase
    .from("creative_render_jobs")
    .update(input as never)
    .eq("id", jobId);

  if (error) {
    throw error;
  }
}

async function createBlueprintAsset(
  context: BuildContext,
  plan: CreativeProductionPlan,
  blueprint: RenderBlueprint,
  format: CreativeAssetFormat,
) {
  const asset = await createAssetRow(context, {
    user_id: context.userId,
    campaign_id: context.campaignId,
    creative_id: plan.creative.id ?? null,
    copy_id: plan.copy.id ?? null,
    asset_type: "render_blueprint",
    format,
    generation_method: "blueprint_only",
    status: "ready",
    metadata: blueprint as unknown as Json,
  });

  await logCreativeAssetSuccess(
    context.supabase,
    asset.id,
    "blueprint_created",
    "Render blueprint stored.",
    blueprint as unknown as Json,
  );

  return asset;
}

async function maybeCreateThumbnailAsset(
  context: BuildContext,
  plan: CreativeProductionPlan,
  format: CreativeAssetFormat,
) {
  if (!plan.thumbnailPrompt) {
    return null;
  }

  const thumbnailAsset = await createAssetRow(context, {
    user_id: context.userId,
    campaign_id: context.campaignId,
    creative_id: plan.creative.id ?? null,
    copy_id: plan.copy.id ?? null,
    asset_type: "thumbnail",
    format,
    generation_method: "image_generation",
    status: "generating",
    provider_name: getImageGenerationProvider().name,
    metadata: plan.thumbnailPrompt as unknown as Json,
  });
  await logCreativeAssetStarted(
    context.supabase,
    thumbnailAsset.id,
    "thumbnail_generation_started",
    "Thumbnail generation started.",
    plan.thumbnailPrompt as unknown as Json,
  );

  const imageProvider = getImageGenerationProvider();
  const result = await imageProvider.generateImage({
    aspectRatio: format,
    prompt: plan.thumbnailPrompt.prompt,
  });

  if (!result.ok || !result.fileUrl) {
    await updateAssetRow(context, thumbnailAsset.id, {
      status: "failed",
      error_message: result.error ?? "Thumbnail generation failed.",
      provider_name: result.providerName,
      provider_asset_id: result.providerAssetId,
      metadata: result.metadata as Json | undefined,
    });
    await logCreativeAssetFailure(
      context.supabase,
      thumbnailAsset.id,
      "thumbnail_generation_failed",
      result.error ?? "Thumbnail generation failed.",
      result.metadata as Json | undefined,
    );
    return null;
  }

  await updateAssetRow(context, thumbnailAsset.id, {
    status: "ready",
    file_url: result.fileUrl,
    thumbnail_url: result.thumbnailUrl ?? result.fileUrl,
    provider_name: result.providerName,
    provider_asset_id: result.providerAssetId,
    metadata: result.metadata as Json | undefined,
  });
  await logCreativeAssetSuccess(
    context.supabase,
    thumbnailAsset.id,
    "thumbnail_generation_completed",
    "Thumbnail asset is ready.",
    result.metadata as Json | undefined,
  );

  return {
    ...thumbnailAsset,
    status: "ready",
    file_url: result.fileUrl,
    thumbnail_url: result.thumbnailUrl ?? result.fileUrl,
  } as CreativeAsset;
}

async function maybeCreateImageFrames(
  context: BuildContext,
  plan: CreativeProductionPlan,
  blueprint: RenderBlueprint,
  format: CreativeAssetFormat,
) {
  const imageProvider = getImageGenerationProvider();

  if (!imageProvider.isConfigured()) {
    return [] as CreativeAsset[];
  }

  const frames: CreativeAsset[] = [];

  for (const scene of blueprint.frames.slice(0, 3)) {
    if (!scene.imagePrompt) {
      continue;
    }

    const asset = await createAssetRow(context, {
      user_id: context.userId,
      campaign_id: context.campaignId,
      creative_id: plan.creative.id ?? null,
      copy_id: plan.copy.id ?? null,
      asset_type: "image_frame",
      format,
      generation_method: "image_generation",
      status: "generating",
      provider_name: imageProvider.name,
      metadata: {
        scene,
      } as unknown as Json,
    });

    await logCreativeAssetStarted(
      context.supabase,
      asset.id,
      "image_frame_generation_started",
      `Generating frame for ${scene.type}.`,
      scene as unknown as Json,
    );

    const result = await imageProvider.generateImage({
      aspectRatio: format,
      prompt: scene.imagePrompt.prompt,
    });

    if (!result.ok || !result.fileUrl) {
      await updateAssetRow(context, asset.id, {
        status: "failed",
        error_message: result.error ?? "Image frame generation failed.",
        provider_name: result.providerName,
        provider_asset_id: result.providerAssetId,
        metadata: result.metadata as Json | undefined,
      });
      await logCreativeAssetFailure(
        context.supabase,
        asset.id,
        "image_frame_generation_failed",
        result.error ?? "Image frame generation failed.",
        result.metadata as Json | undefined,
      );
      continue;
    }

    await updateAssetRow(context, asset.id, {
      status: "ready",
      file_url: result.fileUrl,
      thumbnail_url: result.thumbnailUrl ?? result.fileUrl,
      provider_name: result.providerName,
      provider_asset_id: result.providerAssetId,
      metadata: result.metadata as Json | undefined,
    });
    await logCreativeAssetSuccess(
      context.supabase,
      asset.id,
      "image_frame_generation_completed",
      "Image frame is ready.",
      result.metadata as Json | undefined,
    );

    frames.push({
      ...asset,
      status: "ready",
      file_url: result.fileUrl,
      thumbnail_url: result.thumbnailUrl ?? result.fileUrl,
    } as CreativeAsset);
  }

  return frames;
}

async function maybeCreateVoiceoverAsset(
  context: BuildContext,
  plan: CreativeProductionPlan,
  format: CreativeAssetFormat,
) {
  const voiceProvider = getVoiceProvider();

  if (!voiceProvider.isConfigured()) {
    return null;
  }

  const asset = await createAssetRow(context, {
    user_id: context.userId,
    campaign_id: context.campaignId,
    creative_id: plan.creative.id ?? null,
    copy_id: plan.copy.id ?? null,
    asset_type: "audio_voiceover",
    format,
    generation_method: "tts",
    status: "generating",
    provider_name: voiceProvider.name,
    metadata: {
      script: plan.normalizedScript.script,
      voiceoverConfig: plan.voiceoverConfig,
    } as unknown as Json,
  });

  await logCreativeAssetStarted(
    context.supabase,
    asset.id,
    "voiceover_generation_started",
    "Voiceover generation started.",
  );

  const result = await voiceProvider.synthesizeSpeech({
    aspectRatio: format,
    script: plan.normalizedScript.script,
    voiceProfile: plan.voiceoverConfig.profile,
  });

  if (!result.ok || !result.fileUrl) {
    await updateAssetRow(context, asset.id, {
      status: "failed",
      error_message: result.error ?? "Voiceover generation failed.",
      provider_name: result.providerName,
      provider_asset_id: result.providerAssetId,
      metadata: result.metadata as Json | undefined,
    });
    await logCreativeAssetFailure(
      context.supabase,
      asset.id,
      "voiceover_generation_failed",
      result.error ?? "Voiceover generation failed.",
      result.metadata as Json | undefined,
    );
    return null;
  }

  await updateAssetRow(context, asset.id, {
    status: "ready",
    file_url: result.fileUrl,
    provider_name: result.providerName,
    provider_asset_id: result.providerAssetId,
    metadata: result.metadata as Json | undefined,
  });
  await logCreativeAssetSuccess(
    context.supabase,
    asset.id,
    "voiceover_generation_completed",
    "Voiceover asset is ready.",
    result.metadata as Json | undefined,
  );

  return {
    ...asset,
    status: "ready",
    file_url: result.fileUrl,
  } as CreativeAsset;
}

export async function generateTalkingHeadAsset(
  context: BuildContext,
  plan: CreativeProductionPlan,
  options: BuildOptions,
): Promise<AssetBuildArtifacts> {
  const assets: CreativeAsset[] = [];
  const jobs: CreativeRenderJob[] = [];
  const avatarProvider = getAvatarVideoProvider();

  for (const blueprint of plan.renderBlueprints) {
    const mainAsset = await createAssetRow(context, {
      user_id: context.userId,
      campaign_id: context.campaignId,
      creative_id: plan.creative.id ?? null,
      copy_id: plan.copy.id ?? null,
      asset_type: "talking_head_video",
      format: blueprint.aspectRatio,
      generation_method: avatarProvider.isConfigured() ? "avatar_provider" : "blueprint_only",
      status: options.auto_render ? "generating" : "requires_review",
      provider_name: avatarProvider.name,
      metadata: {
        headline: plan.normalizedScript.headline,
        cta: plan.normalizedScript.cta,
        avatar_profile_id: options.avatar_profile_id ?? null,
      } as unknown as Json,
    });
    assets.push(mainAsset);

    await logCreativeAssetStarted(
      context.supabase,
      mainAsset.id,
      "talking_head_asset_started",
      "Talking head asset build started.",
    );

    const blueprintAsset = await createBlueprintAsset(context, plan, blueprint, blueprint.aspectRatio);
    assets.push(blueprintAsset);

    const thumbnail = await maybeCreateThumbnailAsset(context, plan, blueprint.aspectRatio);
    if (thumbnail) {
      assets.push(thumbnail);
      await updateAssetRow(context, mainAsset.id, {
        thumbnail_url: thumbnail.file_url,
      });
    }

    if (!options.auto_render) {
      await updateAssetRow(context, mainAsset.id, {
        status: "requires_review",
        error_message: "Blueprint created. Avatar rendering not started.",
      });
      await logCreativeAssetInfo(
        context.supabase,
        mainAsset.id,
        "talking_head_requires_review",
        "Blueprint is ready. Render can be triggered later.",
      );
      continue;
    }

    const job = await createRenderJobRow(context, {
      user_id: context.userId,
      campaign_id: context.campaignId,
      creative_asset_id: mainAsset.id,
      render_type: "avatar_video",
      status: avatarProvider.isConfigured() && options.avatar_profile_id ? "processing" : "failed",
      input_payload: {
        script: plan.normalizedScript.script,
        aspectRatio: blueprint.aspectRatio,
        avatarProfileId: options.avatar_profile_id ?? null,
      } as unknown as Json,
      started_at: new Date().toISOString(),
      error_message:
        avatarProvider.isConfigured() && options.avatar_profile_id
          ? null
          : !options.avatar_profile_id
            ? "Avatar profile is required for talking head rendering."
            : "Avatar provider is not configured.",
    });
    jobs.push(job);

    if (!avatarProvider.isConfigured() || !options.avatar_profile_id) {
      await updateAssetRow(context, mainAsset.id, {
        status: "requires_review",
        error_message: job.error_message,
      });
      await logCreativeAssetFailure(
        context.supabase,
        mainAsset.id,
        "avatar_render_unavailable",
        job.error_message ?? "Avatar rendering is unavailable.",
      );
      continue;
    }

    const result = await avatarProvider.createAvatarVideo({
      aspectRatio: blueprint.aspectRatio,
      script: plan.normalizedScript.script,
      avatarProfileId: options.avatar_profile_id,
      voiceProfile: plan.voiceoverConfig.profile,
    });

    await updateRenderJobRow(context, job.id, {
      status: result.ok && result.fileUrl ? "completed" : "failed",
      completed_at: new Date().toISOString(),
      output_payload: result.metadata as Json | undefined,
      error_message: result.error ?? null,
    });

    if (!result.ok || !result.fileUrl) {
      await updateAssetRow(context, mainAsset.id, {
        status: "failed",
        error_message: result.error ?? "Talking head render failed.",
        provider_name: result.providerName,
        provider_asset_id: result.providerAssetId,
      });
      await logCreativeAssetFailure(
        context.supabase,
        mainAsset.id,
        "avatar_render_failed",
        result.error ?? "Talking head render failed.",
        result.metadata as Json | undefined,
      );
      continue;
    }

    await updateAssetRow(context, mainAsset.id, {
      status: "ready",
      file_url: result.fileUrl,
      thumbnail_url: result.thumbnailUrl ?? thumbnail?.file_url ?? null,
      provider_name: result.providerName,
      provider_asset_id: result.providerAssetId,
      metadata: result.metadata as Json | undefined,
    });
    await logCreativeAssetSuccess(
      context.supabase,
      mainAsset.id,
      "avatar_render_completed",
      "Talking head asset is ready.",
      result.metadata as Json | undefined,
    );
  }

  return { assets, jobs };
}

async function buildBlueprintDrivenVideoAsset(
  context: BuildContext,
  plan: CreativeProductionPlan,
  options: BuildOptions,
  videoType: "ugc_video" | "montage_video",
  renderType: "slideshow_video" | "montage_video",
): Promise<AssetBuildArtifacts> {
  const assets: CreativeAsset[] = [];
  const jobs: CreativeRenderJob[] = [];

  for (const blueprint of plan.renderBlueprints) {
    const mainAsset = await createAssetRow(context, {
      user_id: context.userId,
      campaign_id: context.campaignId,
      creative_id: plan.creative.id ?? null,
      copy_id: plan.copy.id ?? null,
      asset_type: videoType,
      format: blueprint.aspectRatio,
      generation_method: "mixed_pipeline",
      status: options.auto_render ? "generating" : "requires_review",
      metadata: {
        summary: `${videoType} planned from saved campaign creative + copy.`,
      } as unknown as Json,
    });
    assets.push(mainAsset);

    await logCreativeAssetStarted(
      context.supabase,
      mainAsset.id,
      "video_asset_started",
      `${videoType} build started.`,
    );

    const blueprintAsset = await createBlueprintAsset(context, plan, blueprint, blueprint.aspectRatio);
    assets.push(blueprintAsset);

    const thumbnail = await maybeCreateThumbnailAsset(context, plan, blueprint.aspectRatio);
    if (thumbnail) {
      assets.push(thumbnail);
      await updateAssetRow(context, mainAsset.id, {
        thumbnail_url: thumbnail.file_url,
      });
    }

    const frameAssets = await maybeCreateImageFrames(context, plan, blueprint, blueprint.aspectRatio);
    assets.push(...frameAssets);

    const voiceAsset = await maybeCreateVoiceoverAsset(context, plan, blueprint.aspectRatio);
    if (voiceAsset) {
      assets.push(voiceAsset);
    }

    const renderJob = await createRenderJobRow(context, {
      user_id: context.userId,
      campaign_id: context.campaignId,
      creative_asset_id: mainAsset.id,
      render_type: renderType,
      status: "failed",
      input_payload: blueprint as unknown as Json,
      started_at: options.auto_render ? new Date().toISOString() : null,
      completed_at: options.auto_render ? new Date().toISOString() : null,
      error_message: options.auto_render
        ? "Video composition provider is not configured in v1. Blueprint and components were stored instead."
        : "Auto render disabled. Blueprint stored for later rendering.",
    });
    jobs.push(renderJob);

    await updateAssetRow(context, mainAsset.id, {
      status: "requires_review",
      error_message: renderJob.error_message,
      thumbnail_url: thumbnail?.file_url ?? null,
      metadata: {
        blueprint_asset_id: blueprintAsset.id,
        frame_asset_ids: frameAssets.map((asset) => asset.id),
        voice_asset_id: voiceAsset?.id ?? null,
      } as unknown as Json,
    });
    await logCreativeAssetInfo(
      context.supabase,
      mainAsset.id,
      "blueprint_ready_media_pending",
      renderJob.error_message ?? "Blueprint ready. Final media rendering pending.",
    );
  }

  return { assets, jobs };
}

export async function generateUGCAsset(
  context: BuildContext,
  plan: CreativeProductionPlan,
  options: BuildOptions,
) {
  return buildBlueprintDrivenVideoAsset(context, plan, options, "ugc_video", "slideshow_video");
}

export async function generateMontageAsset(
  context: BuildContext,
  plan: CreativeProductionPlan,
  options: BuildOptions,
) {
  return buildBlueprintDrivenVideoAsset(context, plan, options, "montage_video", "montage_video");
}

async function buildAssetsForPlan(
  context: BuildContext,
  plan: CreativeProductionPlan,
  options: BuildOptions,
) {
  if (plan.assetType === "talking_head_video") {
    return generateTalkingHeadAsset(context, plan, options);
  }

  if (plan.assetType === "ugc_video") {
    return generateUGCAsset(context, plan, options);
  }

  return generateMontageAsset(context, plan, options);
}

export async function buildCreativeAsset(
  creativeId: string,
  copyId: string,
  campaignId: string,
  userId: string,
  options: BuildOptions,
) {
  const { supabase } = await requireCreativeBuilderContext(userId);
  const record = await getCampaignById(campaignId);

  if (!record) {
    throw new ApiError(404, "Campaign not found.", "not_found");
  }

  const creative = record.creatives.ideas.find((item) => item.id === creativeId);
  const copy = record.creatives.copy.find((item) => item.id === copyId);

  if (!creative || !copy) {
    throw new ApiError(400, "Creative/copy pair could not be found.", "creative_copy_mismatch");
  }

  const context: BuildContext = {
    supabase,
    userId,
    campaignId,
  };
  const plan = planCreativeProduction(creative, copy, record.funnel, record, options);
  return buildAssetsForPlan(context, plan, options);
}

export async function buildCreativeAssetsForCampaign(
  campaignId: string,
  userId: string,
  options: BuildOptions,
): Promise<CreativeBuildResult> {
  const { supabase } = await requireCreativeBuilderContext(userId);
  const record = await getCampaignById(campaignId);

  if (!record) {
    throw new ApiError(404, "Campaign not found.", "not_found");
  }

  const context: BuildContext = {
    supabase,
    userId,
    campaignId,
  };

  const allAssets: CreativeAsset[] = [];
  const allJobs: CreativeRenderJob[] = [];
  let buildFailure: unknown = null;

  try {
    const pairs = matchCreativeCopyPairs(record, options);

    for (const pair of pairs) {
      const plan = planCreativeProduction(pair.creative, pair.copy, record.funnel, record, options);
      const built = await buildAssetsForPlan(context, plan, options);
      allAssets.push(...built.assets);
      allJobs.push(...built.jobs);
    }
  } catch (error) {
    buildFailure = error;
  }

  if (allAssets.length === 0) {
    if (buildFailure) {
      const buildFailureMessage =
        buildFailure instanceof Error
          ? buildFailure.message
          : typeof buildFailure === "string"
            ? buildFailure
            : "Creative asset generation failed before any usable asset was created.";

      logError("Creative asset build failed with no usable assets", {
        campaignId,
        userId,
        message: buildFailureMessage,
      });

      throw new ApiError(500, buildFailureMessage, "creative_asset_build_failed");
    }
  }

  let logs: Awaited<CreativeBuildResult>["logs"] = [];

  try {
    const { data } = await supabase
      .from("creative_asset_logs")
      .select("*")
      .in("creative_asset_id", allAssets.map((asset) => asset.id));

    logs = Array.isArray(data) ? (data as Awaited<CreativeBuildResult>["logs"]) : [];
  } catch {
    logs = [];
  }

  return {
    assets: allAssets,
    renderJobs: allJobs,
    logs,
    summary: {
      totalAssets: allAssets.length,
      readyAssets: allAssets.filter((asset) => asset.status === "ready").length,
      failedAssets: allAssets.filter((asset) => asset.status === "failed").length,
      requiresReviewAssets: allAssets.filter((asset) => asset.status === "requires_review").length,
    },
  };
}

export async function listCampaignCreativeAssets(campaignId: string, userId: string) {
  const { supabase } = await requireCreativeBuilderContext(userId);
  let results: CreativeAsset[] = [];

  try {
    const { data } = await supabase
      .from("creative_assets")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    results = Array.isArray(data)
      ? (data as CreativeAsset[]).filter((asset) => String(asset.asset_type) !== "placeholder")
      : [];
  } catch {
    results = [];
  }

  return results;
}

export async function getCreativeAssetById(
  assetId: string,
  userId?: string,
): Promise<CampaignCreativeAssetRecord | null> {
  const { supabase } = await requireCreativeBuilderContext(userId);
  let query = supabase
    .from("creative_assets")
    .select("*")
    .eq("id", assetId);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: assetRaw, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  if (!assetRaw) {
    return null;
  }

  const asset = assetRaw as CreativeAsset;
  const [campaignRecord, jobsRes, logsRes] = await Promise.all([
    asset.campaign_id ? getCampaignById(asset.campaign_id).catch(() => null) : Promise.resolve(null),
    supabase
      .from("creative_render_jobs")
      .select("*")
      .eq("creative_asset_id", asset.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("creative_asset_logs")
      .select("*")
      .eq("creative_asset_id", asset.id)
      .order("created_at", { ascending: true }),
  ]);
  const creativeFromIdeas =
    campaignRecord?.creatives.ideas.find((item) => item.id === asset.creative_id) ?? null;
  const creativeFromItems =
    campaignRecord?.creatives.items.find((item) => item.id === asset.creative_id) ?? null;
  const copyFromAssets =
    campaignRecord?.creatives.copy.find((item) => item.id === asset.copy_id) ?? null;
  const copyFromItems =
    campaignRecord?.creatives.items.find((item) => `${item.id}-copy` === asset.copy_id) ?? null;

  return {
    asset,
    creative:
      creativeFromIdeas ??
      (creativeFromItems && campaignRecord
        ? {
            id: asset.creative_id ?? creativeFromItems.id,
            campaign_id: campaignRecord.campaign.id,
            hook: creativeFromItems.hook,
            angle: creativeFromItems.angle,
            format: creativeFromItems.format,
            concept: creativeFromItems.concept || creativeFromItems.title,
            visual_direction: creativeFromItems.visualDirection,
            created_at: campaignRecord.campaign.updated_at ?? campaignRecord.campaign.created_at,
          }
        : null),
    copy:
      copyFromAssets ??
      (copyFromItems && campaignRecord
        ? {
            id: asset.copy_id ?? `${copyFromItems.id}-copy`,
            campaign_id: campaignRecord.campaign.id,
            hook: copyFromItems.hook,
            primary_text: copyFromItems.primaryText,
            script: copyFromItems.scriptLines.join("\n"),
            headline: copyFromItems.headline || copyFromItems.title,
            cta: copyFromItems.cta,
            created_at: campaignRecord.campaign.updated_at ?? campaignRecord.campaign.created_at,
          }
        : null),
    jobs: Array.isArray(jobsRes.data) ? (jobsRes.data as CreativeRenderJob[]) : [],
    logs: Array.isArray(logsRes.data)
      ? (logsRes.data as Awaited<CampaignCreativeAssetRecord["logs"]>)
      : [],
  };
}

export async function getLaunchReadyCreativeMedia(
  campaignId: string,
  userId: string,
): Promise<LaunchReadyCreativeMedia[]> {
  const assets = await listCampaignCreativeAssets(campaignId, userId);

  return assets
    .filter(
      (asset) =>
        asset.status === "ready" &&
        Boolean(asset.file_url || asset.thumbnail_url) &&
        asset.asset_type !== "render_blueprint" &&
        asset.asset_type !== "audio_voiceover" &&
        isLaunchReadyStaticImageAsset(asset),
    )
    .map((asset) => ({
      creativeId: asset.creative_id,
      copyId: asset.copy_id,
      fileUrl: asset.file_url,
      thumbnailUrl: asset.thumbnail_url,
      format: asset.format,
      assetType: asset.asset_type as LaunchReadyCreativeMedia["assetType"],
    }));
}

function mapManualAssetType(kind: ManualCreativeAssetKind) {
  if (kind === "video") {
    return "ugc_video" as const;
  }

  if (kind === "thumbnail") {
    return "thumbnail" as const;
  }

  return "image_frame" as const;
}

export async function uploadManualCreativeAsset(params: {
  campaignId: string;
  userId?: string;
  file: File;
  kind: ManualCreativeAssetKind;
  label?: string | null;
  caption?: string | null;
}) {
  const { supabase, userId } = await requireCreativeBuilderContext(params.userId);
  const record = await getCampaignById(params.campaignId);

  if (!record) {
    throw new ApiError(404, "Campaign not found.", "not_found");
  }

  const verifiedFile = await verifyManualCreativeFile({
    file: params.file,
    kind: params.kind,
    allowedTypes: params.kind === "video"
      ? new Set(["video/mp4", "video/quicktime", "video/webm"])
      : new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  });
  const extension = verifiedFile.extension;
  const storagePath = `${userId}/${params.campaignId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(MANUAL_MEDIA_BUCKET)
    .upload(storagePath, verifiedFile.bytes, {
      cacheControl: "3600",
      contentType: verifiedFile.contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new ApiError(500, "Media file could not be uploaded.", "media_upload_failed");
  }

  const { data: publicUrlData } = supabase.storage
    .from(MANUAL_MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = publicUrlData.publicUrl;

  const { data, error } = await supabase
    .from("creative_assets")
    .insert({
      user_id: userId,
      campaign_id: params.campaignId,
      creative_id: null,
      copy_id: null,
      asset_type: mapManualAssetType(params.kind),
      format: params.kind === "video" ? "16:9" : "16:9",
      generation_method: "mixed_pipeline",
      status: "ready",
      provider_name: "manual_upload",
      provider_asset_id: null,
      file_url: publicUrl,
      thumbnail_url: params.kind === "thumbnail" ? publicUrl : null,
      metadata: {
        role: params.kind,
        label: params.label ?? null,
        caption: params.caption ?? null,
        storageBucket: MANUAL_MEDIA_BUCKET,
        storagePath,
        originalFileName: params.file.name,
        mimeType: verifiedFile.contentType,
      } as Json,
    } as never)
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError(500, error?.message ?? "Creative asset could not be created.", "creative_asset_create_failed");
  }

  return data as CreativeAsset;
}

export async function deleteCreativeAssetById(assetId: string, userId?: string) {
  const { supabase } = await requireCreativeBuilderContext(userId);
  let query = supabase
    .from("creative_assets")
    .select("*")
    .eq("id", assetId);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new ApiError(404, "Creative asset not found.", "not_found");
  }

  const asset = data as CreativeAsset;
  const metadata = asset.metadata && typeof asset.metadata === "object"
    ? (asset.metadata as Record<string, unknown>)
    : null;
  const storageBucket = typeof metadata?.storageBucket === "string" ? metadata.storageBucket : null;
  const storagePath = typeof metadata?.storagePath === "string" ? metadata.storagePath : null;

  if (storageBucket && storagePath) {
    await supabase.storage.from(storageBucket).remove([storagePath]).catch(() => undefined);
  }

  let deleteQuery = supabase
    .from("creative_assets")
    .delete()
    .eq("id", assetId);

  if (userId) {
    deleteQuery = deleteQuery.eq("user_id", userId);
  }

  const { error: deleteError } = await deleteQuery;

  if (deleteError) {
    throw deleteError;
  }

  return { success: true };
}
