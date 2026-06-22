import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STATIC_CREATIVE_STORAGE_BUCKET,
  type StaticCreativeStorageNormalizationResult,
} from "@/lib/services/static-creative-storage-normalization";
import {
  buildComposedStaticAdPreview,
  type ComposedStaticAdPreview,
} from "@/lib/services/static-ad-template-renderer";
import type { StaticCreativeAsset } from "@/lib/services/creative-engine";
import type { Database } from "@/lib/supabase/types";

export const APP_COMPOSED_STATIC_FINAL_VERSION = "app_composed_static_v2";

export type StaticCreativeCompositionMetadata = {
  appComposedFinal: true;
  qualityTier: "draft_preview" | "premium_final";
  visualQualityGate: {
    accepted: boolean;
    mode: "composition_provenance";
    reasons: string[];
  };
  premiumQualityGate: {
    accepted: boolean;
    mode: "higgsfield_source_provenance";
    reasons: string[];
  };
  compositionHash: string;
  compositionVersion: typeof APP_COMPOSED_STATIC_FINAL_VERSION;
  layoutTemplateId: string;
  staticBriefHash: string | null;
  offerHash: string | null;
  ctaHash: string | null;
  brandHash: string | null;
  sourceBackgroundKind: "higgsfield_visual_background" | "provider_visual_background" | "app_fallback_visual";
  sourceBackgroundProvider: string | null;
  sourceBackgroundAssetId: string | null;
  sourceImageQaMode: string | null;
  sourceImageQaDecision: string | null;
  sourceImageQaOverride: string | null;
  renderedOffer: string;
  renderedCta: string;
  renderedBrand: string | null;
};

export type ComposeAndUploadStaticCreativeFinalParams = {
  supabase: SupabaseClient<Database>;
  userId: string;
  campaignId: string;
  creativeId: string;
  generationBatchId: string;
  asset: StaticCreativeAsset;
};

export type ComposeAndUploadStaticCreativeFinalResult = StaticCreativeStorageNormalizationResult & {
  metadata: StaticCreativeCompositionMetadata;
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function xml(value: unknown) {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toSlug(value: string) {
  return safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "creative";
}

function hashObject(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
}

function sourceImageQaAccepted(asset: StaticCreativeAsset) {
  return Boolean(
    asset.imageQa?.mode === "background_only" &&
      asset.imageQa.decision === "accept" &&
      asset.imageQa.usable !== false,
  );
}

function sourceImageQaCanBePromotedFromFinishedAdSource(asset: StaticCreativeAsset) {
  const reasons = Array.isArray(asset.imageQa?.reasons) ? asset.imageQa.reasons : [];
  const allowedFinishedAdSourceReasons = new Set([
    "text_heavy",
    "chart_or_table_detected",
    "fake_ad_layout",
    "provider_returned_finished_ad",
    "finished_ad_text_unverified",
  ]);

  return Boolean(
    (asset.imageGenerationProvider === "higgsfield_marketing_studio" || asset.imageGenerationProvider === "higgsfield") &&
      asset.imageUrl &&
      (
        (
          asset.imageQa?.mode === "finished_ad" &&
          asset.imageQa.decision === "accept" &&
          asset.imageQa.usable !== false
        ) ||
        (
          asset.imageQa?.mode === "background_only" &&
          asset.imageQa.decision === "reject" &&
          asset.imageQa.usable === false &&
          reasons.length > 0 &&
          reasons.every((reason) => allowedFinishedAdSourceReasons.has(reason))
        )
      ),
  );
}

function wrapWords(value: string, maxChars: number, maxLines: number) {
  const words = safeText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }

    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  const lastIndex = lines.length - 1;
  if (lastIndex >= 0 && words.join(" ").length > lines.join(" ").length) {
    lines[lastIndex] = `${lines[lastIndex].replace(/[.,;:!?]+$/, "")}...`;
  }

  return lines;
}

function palette(preview: ComposedStaticAdPreview) {
  if (preview.category === "seller") {
    return { bg1: "#f8f4ec", bg2: "#122033", accent: "#ef233c", dark: "#101820", light: "#ffffff", muted: "#e8eef5" };
  }
  if (preview.category === "buyer") {
    return { bg1: "#eef8f1", bg2: "#123d67", accent: "#2f80ed", dark: "#101820", light: "#ffffff", muted: "#dbeafe" };
  }
  if (preview.category === "investor") {
    return { bg1: "#071217", bg2: "#124132", accent: "#46d37a", dark: "#071217", light: "#ffffff", muted: "#dcfce7" };
  }
  if (preview.category === "commercial") {
    return { bg1: "#f5f8fc", bg2: "#1e3a5f", accent: "#2563eb", dark: "#101820", light: "#ffffff", muted: "#dbeafe" };
  }
  if (preview.category === "precon") {
    return { bg1: "#f8fafc", bg2: "#283548", accent: "#f97316", dark: "#111827", light: "#ffffff", muted: "#ffedd5" };
  }
  return { bg1: "#090909", bg2: "#2b2417", accent: "#d6b45f", dark: "#090909", light: "#fff8e8", muted: "#f4ead2" };
}

function textBlock(lines: string[], x: number, y: number, size: number, lineHeight: number, fill: string, weight = 800) {
  return lines.map((line, index) =>
    `<text x="${x}" y="${y + index * lineHeight}" fill="${fill}" font-size="${size}" font-weight="${weight}" font-family="Inter, Arial, Helvetica, sans-serif">${xml(line)}</text>`,
  ).join("");
}

function renderStaticCreativeFinalOverlaySvg(asset: StaticCreativeAsset) {
  const preview = buildComposedStaticAdPreview({
    ...asset,
    imageUrl: null,
    storageNormalized: false,
  });
  const colors = palette(preview);
  const headline = safeText(asset.approvedOfferTitle) || safeText(asset.offer) || preview.headline;
  const brand = safeText(asset.approvedBrand);
  const cta = safeText(asset.approvedCta) || preview.cta;
  const headlineLines = wrapWords(headline, 27, 3);
  const primaryLines = wrapWords(preview.primaryText, 54, 2);
  const brandText = brand || "DealFlow Partner";

  return {
    preview,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#0f172a" flood-opacity="0.22"/>
        </filter>
        <linearGradient id="scrim" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#020617" stop-opacity="0.12"/>
          <stop offset="58%" stop-color="#020617" stop-opacity="0.24"/>
          <stop offset="100%" stop-color="#020617" stop-opacity="0.48"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1080" fill="url(#scrim)"/>
      <rect x="54" y="54" width="972" height="972" rx="58" fill="none" stroke="${colors.light}" stroke-opacity="0.36" stroke-width="4"/>
      <g filter="url(#shadow)">
        <rect x="72" y="82" width="438" height="72" rx="36" fill="${colors.light}" opacity="0.95"/>
        <text x="110" y="128" fill="${colors.dark}" font-size="22" font-weight="950" letter-spacing="5" font-family="Inter, Arial, Helvetica, sans-serif">${xml(preview.location)}</text>
      </g>
      <g filter="url(#shadow)">
        <rect x="604" y="84" width="404" height="238" rx="38" fill="${colors.light}" opacity="0.92"/>
        <text x="638" y="142" fill="#64748b" font-size="18" font-weight="900" letter-spacing="5" font-family="Inter, Arial, Helvetica, sans-serif">${xml(preview.category === "seller" ? "SELLER PLAN" : "VALUE MAP")}</text>
        <rect x="638" y="176" width="336" height="84" rx="24" fill="${colors.accent}"/>
        ${textBlock(wrapWords(preview.overlayText, 18, 2), 662, 222, 27, 32, colors.light, 950)}
      </g>
      <g filter="url(#shadow)">
        <rect x="72" y="660" width="936" height="246" rx="36" fill="${colors.light}" opacity="0.96"/>
        <text x="110" y="718" fill="#64748b" font-size="19" font-weight="900" letter-spacing="5" font-family="Inter, Arial, Helvetica, sans-serif">${xml(preview.eyebrow)}</text>
        ${textBlock(headlineLines, 110, 770, headlineLines.length >= 3 ? 43 : 50, headlineLines.length >= 3 ? 48 : 56, "#05070a", 950)}
        ${textBlock(primaryLines, 112, 882, 22, 30, "#334155", 700)}
        <rect x="672" y="798" width="294" height="78" rx="39" fill="${colors.dark}"/>
        <text x="819" y="846" text-anchor="middle" fill="${colors.light}" font-size="24" font-weight="950" font-family="Inter, Arial, Helvetica, sans-serif">${xml(cta)}</text>
      </g>
      <g transform="translate(72 940)">
        <rect x="0" y="0" width="936" height="68" rx="34" fill="${colors.dark}" opacity="0.92"/>
        <text x="34" y="43" fill="${colors.light}" font-size="22" font-weight="850" font-family="Inter, Arial, Helvetica, sans-serif">${xml(brandText)}</text>
        <text x="902" y="43" text-anchor="end" fill="${colors.light}" opacity="0.82" font-size="18" font-weight="800" letter-spacing="4" font-family="Inter, Arial, Helvetica, sans-serif">${xml(preview.category.toUpperCase())}</text>
      </g>
    </svg>`,
  };
}

export async function composeStaticCreativeFinalPng(asset: StaticCreativeAsset) {
  const { svg, preview } = renderStaticCreativeFinalOverlaySvg(asset);
  const sharp = (await import("sharp")).default;
  const sourceImageUrl = safeText(asset.imageUrl);
  if (!sourceImageUrl) {
    throw new Error("A generated source image is required before composing a final static creative.");
  }

  const response = await fetch(sourceImageUrl);
  if (!response.ok) {
    throw new Error("Generated source image could not be loaded for final composition.");
  }

  const sourceImageBuffer = Buffer.from(await response.arrayBuffer());
  const overlayBuffer = Buffer.from(svg);
  const png = await sharp(sourceImageBuffer, { limitInputPixels: 64_000_000 })
    .rotate()
    .resize(1080, 1080, { fit: "cover", position: "attention" })
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .png({ compressionLevel: 9, quality: 92 })
    .toBuffer();

  return { png, preview };
}

export function buildStaticCreativeCompositionMetadata(
  asset: StaticCreativeAsset,
  preview: ComposedStaticAdPreview,
): StaticCreativeCompositionMetadata {
  const sourceBackgroundKind =
    asset.imageGenerationProvider === "higgsfield_marketing_studio" || asset.imageGenerationProvider === "higgsfield"
      ? "higgsfield_visual_background"
      : asset.imageUrl
        ? "provider_visual_background"
        : "app_fallback_visual";
  const sourceBackgroundAssetId = asset.imageUrl ? hashObject({ imageUrl: asset.imageUrl }) : null;
  const renderedOffer = safeText(asset.approvedOfferTitle) || safeText(asset.offer) || preview.headline;
  const renderedCta = safeText(asset.approvedCta) || preview.cta;
  const renderedBrand = safeText(asset.approvedBrand) || null;
  const sourceQaAccepted = sourceImageQaAccepted(asset);
  const finishedAdSourcePromoted = sourceImageQaCanBePromotedFromFinishedAdSource(asset);
  const premiumReasons = [
    sourceBackgroundKind === "higgsfield_visual_background" ? null : "premium_higgsfield_source_required",
    asset.imageUrl ? null : "source_image_required",
    sourceQaAccepted || finishedAdSourcePromoted ? null : "source_image_qa_required",
  ].filter((reason): reason is string => Boolean(reason));
  const premiumAccepted = premiumReasons.length === 0;
  const compositionHash = hashObject({
    version: APP_COMPOSED_STATIC_FINAL_VERSION,
    assetId: asset.id,
    templateId: preview.templateId,
    renderedOffer,
    renderedCta,
    renderedBrand,
    sourceBackgroundAssetId,
    sourceImageQaMode: asset.imageQa?.mode ?? null,
    sourceImageQaDecision: asset.imageQa?.decision ?? null,
    staticBriefHash: asset.staticBriefHash ?? null,
    offerHash: asset.offerHash ?? null,
    ctaHash: asset.ctaHash ?? null,
    brandHash: asset.brandHash ?? null,
    headline: preview.headline,
    overlayText: preview.overlayText,
    primaryText: preview.primaryText,
  });

  return {
    appComposedFinal: true,
    qualityTier: premiumAccepted ? "premium_final" : "draft_preview",
    visualQualityGate: {
      accepted: premiumAccepted,
      mode: "composition_provenance",
      reasons: premiumAccepted ? [] : ["app_fallback_visual_not_launch_ready"],
    },
    premiumQualityGate: {
      accepted: premiumAccepted,
      mode: "higgsfield_source_provenance",
      reasons: premiumReasons,
    },
    compositionHash,
    compositionVersion: APP_COMPOSED_STATIC_FINAL_VERSION,
    layoutTemplateId: preview.templateId,
    staticBriefHash: asset.staticBriefHash ?? null,
    offerHash: asset.offerHash ?? null,
    ctaHash: asset.ctaHash ?? null,
    brandHash: asset.brandHash ?? null,
    sourceBackgroundKind,
    sourceBackgroundProvider: asset.imageGenerationProvider ?? null,
    sourceBackgroundAssetId,
    sourceImageQaMode: asset.imageQa?.mode ?? null,
    sourceImageQaDecision: asset.imageQa?.decision ?? null,
    sourceImageQaOverride: finishedAdSourcePromoted
      ? "fresh_higgsfield_finished_ad_source_promoted_to_app_composed_v2"
      : null,
    renderedOffer,
    renderedCta,
    renderedBrand,
  };
}

export async function composeAndUploadStaticCreativeFinal(
  params: ComposeAndUploadStaticCreativeFinalParams,
): Promise<ComposeAndUploadStaticCreativeFinalResult> {
  const { png, preview } = await composeStaticCreativeFinalPng(params.asset);
  const metadata = buildStaticCreativeCompositionMetadata(params.asset, preview);
  const safeCreativeId = toSlug(params.creativeId);
  const storagePath = `${params.userId}/${params.campaignId}/app-composed-static/${safeCreativeId}/${metadata.compositionHash}.png`;
  const { error: uploadError } = await params.supabase.storage
    .from(STATIC_CREATIVE_STORAGE_BUCKET)
    .upload(storagePath, png, {
      cacheControl: "31536000",
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error("App-composed static image could not be stored durably.");
  }

  const { data } = params.supabase.storage
    .from(STATIC_CREATIVE_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  if (!data.publicUrl) {
    throw new Error("App-composed static image storage URL could not be created.");
  }

  return {
    durableUrl: data.publicUrl,
    storageBucket: STATIC_CREATIVE_STORAGE_BUCKET,
    storagePath,
    contentType: "image/png",
    byteSize: png.byteLength,
    reusedExistingAppAsset: false,
    metadata,
  };
}
