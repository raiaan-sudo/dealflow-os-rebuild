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

export const APP_COMPOSED_STATIC_FINAL_VERSION = "app_composed_static_v1";

export type StaticCreativeCompositionMetadata = {
  appComposedFinal: true;
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

function renderHouseScene(preview: ComposedStaticAdPreview, colors: ReturnType<typeof palette>) {
  const premiumDark = preview.category === "investor" || preview.category === "luxury";
  const windowColor = premiumDark ? "#f8fafc" : "#dbeafe";
  return `
    <g transform="translate(72 112)">
      <rect x="0" y="0" width="492" height="486" rx="38" fill="${premiumDark ? "#172033" : "#ffffff"}" opacity="${premiumDark ? "0.86" : "0.94"}"/>
      <rect x="34" y="274" width="424" height="150" rx="12" fill="${preview.category === "seller" ? "#b36a3f" : colors.bg2}"/>
      <polygon points="58,274 246,118 436,274" fill="${preview.category === "luxury" ? "#4b3b24" : "#c9a47c"}"/>
      <polygon points="30,286 246,84 464,286 432,286 246,128 62,286" fill="${colors.accent}"/>
      <rect x="116" y="306" width="82" height="118" rx="8" fill="${colors.dark}" opacity="0.88"/>
      <rect x="242" y="306" width="152" height="76" rx="10" fill="${windowColor}" opacity="0.95"/>
      <line x1="318" y1="306" x2="318" y2="382" stroke="${colors.bg2}" stroke-width="6" opacity="0.35"/>
      <line x1="242" y1="344" x2="394" y2="344" stroke="${colors.bg2}" stroke-width="6" opacity="0.35"/>
      <circle cx="80" cy="84" r="42" fill="${colors.accent}" opacity="0.16"/>
      <rect x="34" y="34" width="154" height="42" rx="21" fill="${colors.light}" opacity="0.96"/>
      <text x="58" y="61" fill="${colors.dark}" font-size="18" font-weight="900" font-family="Inter, Arial, Helvetica, sans-serif">${xml(preview.location)}</text>
    </g>
  `;
}

function renderProofPanel(preview: ComposedStaticAdPreview, colors: ReturnType<typeof palette>) {
  const chips = preview.proofChips.length > 0 ? preview.proofChips.slice(0, 3) : preview.visualRules.slice(0, 3);
  return `
    <g transform="translate(604 112)">
      <rect x="0" y="0" width="404" height="486" rx="38" fill="${colors.light}" opacity="0.96"/>
      <text x="34" y="58" fill="#617084" font-size="18" font-weight="900" letter-spacing="5" font-family="Inter, Arial, Helvetica, sans-serif">${xml(preview.category === "seller" ? "SELLER PLAN" : "VALUE MAP")}</text>
      <rect x="34" y="98" width="336" height="96" rx="22" fill="${colors.accent}"/>
      ${textBlock(wrapWords(preview.overlayText, 18, 2), 58, 142, 30, 36, colors.light, 900)}
      <g transform="translate(34 230)">
        ${chips.map((chip, index) => `
          <rect x="0" y="${index * 68}" width="336" height="50" rx="25" fill="${index === 0 ? colors.muted : "#f1f5f9"}"/>
          <text x="24" y="${index * 68 + 32}" fill="${colors.dark}" font-size="20" font-weight="850" font-family="Inter, Arial, Helvetica, sans-serif">${xml(chip)}</text>
        `).join("")}
      </g>
    </g>
  `;
}

export function renderStaticCreativeFinalSvg(asset: StaticCreativeAsset) {
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
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${colors.bg1}"/>
          <stop offset="55%" stop-color="${colors.muted}"/>
          <stop offset="100%" stop-color="${colors.accent}"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#0f172a" flood-opacity="0.22"/>
        </filter>
      </defs>
      <rect width="1080" height="1080" fill="url(#bg)"/>
      <circle cx="930" cy="120" r="210" fill="${colors.light}" opacity="0.16"/>
      <circle cx="96" cy="934" r="260" fill="${colors.dark}" opacity="0.11"/>
      ${renderHouseScene(preview, colors)}
      ${renderProofPanel(preview, colors)}
      <g filter="url(#shadow)">
        <rect x="72" y="660" width="936" height="246" rx="36" fill="${colors.light}"/>
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
  const { svg, preview } = renderStaticCreativeFinalSvg(asset);
  const sharp = (await import("sharp")).default;
  const png = await sharp(Buffer.from(svg))
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
  const renderedOffer = safeText(asset.approvedOfferTitle) || safeText(asset.offer) || preview.headline;
  const renderedCta = safeText(asset.approvedCta) || preview.cta;
  const renderedBrand = safeText(asset.approvedBrand) || null;
  const compositionHash = hashObject({
    version: APP_COMPOSED_STATIC_FINAL_VERSION,
    assetId: asset.id,
    templateId: preview.templateId,
    renderedOffer,
    renderedCta,
    renderedBrand,
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
    compositionHash,
    compositionVersion: APP_COMPOSED_STATIC_FINAL_VERSION,
    layoutTemplateId: preview.templateId,
    staticBriefHash: asset.staticBriefHash ?? null,
    offerHash: asset.offerHash ?? null,
    ctaHash: asset.ctaHash ?? null,
    brandHash: asset.brandHash ?? null,
    sourceBackgroundKind,
    sourceBackgroundProvider: asset.imageGenerationProvider ?? null,
    sourceBackgroundAssetId: asset.imageUrl ? hashObject({ imageUrl: asset.imageUrl }) : null,
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
