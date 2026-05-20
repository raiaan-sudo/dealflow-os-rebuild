import { inflateSync } from "node:zlib";
import type {
  StaticCreativeImageQaMode,
  StaticCreativeImageQaReason,
  StaticCreativeImageQaResult,
} from "@/lib/services/static-creative-visual-qa";
import { inspectFinishedAdWithVisionQa } from "@/lib/services/finished-ad-vision-qa";
import { fetchStaticCreativeProviderImage } from "@/lib/services/static-creative-storage-normalization";

export type StaticCreativeImageQaInput = {
  imageUrl: string;
  campaignId: string;
  creativeId?: string;
  mode?: StaticCreativeImageQaMode;
  prompt?: string;
  negativePrompt?: string;
  campaignContext?: {
    market?: string;
    campaignType?: string;
    audience?: string;
    offer?: string;
    propertyType?: string;
    cta?: string;
  };
};

type FetchedImage = {
  ok: boolean;
  timeout?: boolean;
  contentType?: string;
  bytes?: Uint8Array;
};

type AnalyzeResult = {
  textDensity: number;
  layoutRisk: number;
  detectedTextSamples: string[];
  reasons: StaticCreativeImageQaReason[];
  textInspectionAvailable?: boolean;
};

const BACKGROUND_ONLY_QA_MODE: StaticCreativeImageQaMode = "background_only";
const MAX_IMAGE_BYTES = 4_000_000;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function assertServerSide() {
  if (typeof window !== "undefined") {
    throw new Error("Static creative image QA is server-side only.");
  }
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniq<T>(values: T[]) {
  return Array.from(new Set(values));
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeQaMode(value: StaticCreativeImageQaInput["mode"]): StaticCreativeImageQaMode {
  return value === "finished_ad" ? "finished_ad" : BACKGROUND_ONLY_QA_MODE;
}

function hasNegation(sentence: string) {
  return /\b(do not|don't|dont|avoid|never|no|without|not a|not an|not the)\b/i.test(sentence);
}

function collectPromptRiskReasons(
  input: StaticCreativeImageQaInput,
  mode: StaticCreativeImageQaMode,
): StaticCreativeImageQaReason[] {
  const prompt = safeText(input.prompt);
  if (!prompt) {
    return [];
  }

  const sentences = prompt
    .split(/[.!?\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const reasons: StaticCreativeImageQaReason[] = [];

  for (const sentence of sentences) {
    if (hasNegation(sentence) || /\b(media-buyer reference pattern|source imagery logic)\b/i.test(sentence)) {
      continue;
    }

    if (
      mode === "background_only" &&
      /\b(final ad|finished ad|paid social creative|ad layout|poster|campaign graphic)\b/i.test(sentence)
    ) {
      reasons.push("provider_returned_finished_ad", "fake_ad_layout");
    }

    if (/\b(flyer|brochure|one[- ]pager|sell sheet)\b/i.test(sentence)) {
      reasons.push("flyer_or_brochure_layout");
    }

    if (/\b(dashboard|ui screen|interface|app screen|web page|landing page|screenshot)\b/i.test(sentence)) {
      reasons.push("ui_or_dashboard_layout");
    }

    if (/\b(chart|table|spreadsheet|grid|graph|infographic)\b/i.test(sentence)) {
      reasons.push("chart_or_table_detected");
    }

    if (/\b(listing sheet|mls sheet|property sheet|bed bath|price card)\b/i.test(sentence)) {
      reasons.push("listing_sheet_detected");
    }

    if (/\b(cta button|button|tap here|click here)\b/i.test(sentence)) {
      reasons.push("button_or_fake_cta_detected");
    }
  }

  return uniq(reasons);
}

function filterReasonsForMode(
  reasons: StaticCreativeImageQaReason[],
  mode: StaticCreativeImageQaMode,
): StaticCreativeImageQaReason[] {
  if (mode === "background_only") {
    return uniq(reasons);
  }

  return uniq(reasons.filter((reason) => (
    reason === "gibberish_text_detected" ||
    reason === "ui_or_dashboard_layout" ||
    reason === "chart_or_table_detected" ||
    reason === "listing_sheet_detected" ||
    reason === "finished_ad_text_unverified" ||
    reason === "required_cta_missing" ||
    reason === "required_offer_missing" ||
    reason === "brand_misspelled" ||
    reason === "image_fetch_failed" ||
    reason === "qa_timeout"
  )));
}

async function fetchImageBytes(url: string): Promise<FetchedImage> {
  try {
    const fetched = await fetchStaticCreativeProviderImage(url, {
      maxBytes: MAX_IMAGE_BYTES,
      accept: "image/png,image/jpeg,image/webp,image/svg+xml",
      errorPrefix: "Generated image QA",
    });

    return { ok: true, contentType: fetched.contentType, bytes: fetched.bytes };
  } catch (error) {
    return {
      ok: false,
      timeout: error instanceof Error && /timed out/i.test(error.message),
    };
  }
}

function extractSvgTextSamples(text: string) {
  const samples = [...text.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const ariaSamples = [...text.matchAll(/\b(?:aria-label|alt|title)=["']([^"']{2,120})["']/gi)]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return uniq([...samples, ...ariaSamples]).slice(0, 24);
}

function sampleLooksGibberish(sample: string) {
  const compact = sample.replace(/[^a-z]/gi, "").toLowerCase();
  if (compact.length < 5) {
    return false;
  }

  return (
    /(?:[bcdfghjklmnpqrstvwxyz]{5,}|[qxz]{2,}|[a-z]{1,3}\d[a-z]{1,3})/i.test(compact) ||
    /\b(lorem|ipsum|asdf|qwer|xqz|zxq|plom|brt|blorf|glip)\b/i.test(sample)
  );
}

function textSamplesToReasons(samples: string[]): StaticCreativeImageQaReason[] {
  const joined = samples.join(" ").toLowerCase();
  const reasons: StaticCreativeImageQaReason[] = [];

  if (samples.some(sampleLooksGibberish)) {
    reasons.push("gibberish_text_detected");
  }

  if (/\b(dashboard|pipeline|analytics|crm|login|form|submit|menu|settings|report)\b/.test(joined)) {
    reasons.push("ui_or_dashboard_layout");
  }

  if (/\b(bed|bath|sqft|mls|listing|price|open house|property details)\b/.test(joined)) {
    reasons.push("listing_sheet_detected");
  }

  if (/\b(roi|cap rate|cash flow|table|chart|graph|yield|metric)\b/.test(joined)) {
    reasons.push("chart_or_table_detected");
  }

  if (/\b(click|tap|learn more|get started|submit|sign up|call now|book now)\b/.test(joined)) {
    reasons.push("button_or_fake_cta_detected");
  }

  if (/\b(flyer|brochure|limited time|special offer|poster)\b/.test(joined)) {
    reasons.push("flyer_or_brochure_layout");
  }

  return uniq(reasons);
}

function analyzeSvg(bytes: Uint8Array): AnalyzeResult {
  const svg = Buffer.from(bytes).toString("utf8");
  const samples = extractSvgTextSamples(svg);
  const textChars = samples.join("").length;
  const textDensity = clamp01(textChars / Math.max(svg.length, 1));
  const rectCount = (svg.match(/<(rect|path|line|polyline|polygon)\b/gi) ?? []).length;
  const gridish = /<table\b|display\s*:\s*grid|grid-template|dashboard|chart|listing|flyer|brochure/i.test(svg);
  const layoutRisk = clamp01((rectCount / 36) + (gridish ? 0.48 : 0) + (samples.length / 18));
  const reasons = textSamplesToReasons(samples);

  if (samples.length >= 6 || textDensity > 0.045) {
    reasons.push("text_heavy");
  }

  if (layoutRisk > 0.6 && reasons.length === 0) {
    reasons.push("fake_ad_layout");
  }

  return {
    textDensity,
    layoutRisk,
    detectedTextSamples: samples,
    reasons: uniq(reasons),
    textInspectionAvailable: true,
  };
}

function isPng(bytes: Uint8Array) {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readUInt32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function parsePng(bytes: Uint8Array) {
  if (!isPng(bytes)) {
    return null;
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];

  while (offset + 12 <= bytes.length) {
    const length = readUInt32(bytes, offset);
    const type = Buffer.from(bytes.slice(offset + 4, offset + 8)).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd + 4 > bytes.length) {
      return null;
    }

    if (type === "IHDR") {
      width = readUInt32(bytes, dataStart);
      height = readUInt32(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
    } else if (type === "IDAT") {
      idat.push(bytes.slice(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8 || ![0, 2, 6].includes(colorType)) {
    return null;
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const expected = (stride + 1) * height;
  if (inflated.length < expected) {
    return null;
  }

  const rows = new Uint8Array(width * height);
  let sourceOffset = 0;
  let prev = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const raw = inflated.slice(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    const row = new Uint8Array(stride);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev[x] ?? 0;
      const upLeft = x >= channels ? prev[x - channels] ?? 0 : 0;
      const pa = Math.abs(up - upLeft);
      const pb = Math.abs(left - upLeft);
      const pc = Math.abs(left + up - (2 * upLeft));
      const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      const value =
        filter === 0 ? raw[x]
          : filter === 1 ? raw[x] + left
          : filter === 2 ? raw[x] + up
          : filter === 3 ? raw[x] + Math.floor((left + up) / 2)
          : filter === 4 ? raw[x] + predictor
          : raw[x];
      row[x] = value & 255;
    }

    for (let x = 0; x < width; x += 1) {
      const i = x * channels;
      const r = row[i];
      const g = colorType === 0 ? r : row[i + 1];
      const b = colorType === 0 ? r : row[i + 2];
      rows[(y * width) + x] = Math.round((0.299 * r) + (0.587 * g) + (0.114 * b));
    }

    prev = row;
  }

  return { width, height, luma: rows };
}

function analyzePng(bytes: Uint8Array): AnalyzeResult {
  const png = parsePng(bytes);
  if (!png) {
    return { textDensity: 0, layoutRisk: 0, detectedTextSamples: [], reasons: [], textInspectionAvailable: false };
  }

  const { width, height, luma } = png;
  const total = Math.max(1, width * height);
  let light = 0;
  let dark = 0;
  let edge = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width) + x;
      const value = luma[idx];
      if (value > 228) light += 1;
      if (value < 78) dark += 1;

      if (x > 0 && y > 0) {
        const horizontal = Math.abs(value - luma[idx - 1]);
        const vertical = Math.abs(value - luma[idx - width]);
        if (horizontal > 92 || vertical > 92) {
          edge += 1;
        }
      }
    }
  }

  const darkDensity = dark / total;
  const edgeDensity = edge / total;
  const lightDensity = light / total;
  const rowLineCount = Array.from({ length: height }, (_, y) => {
    let rowDark = 0;
    for (let x = 0; x < width; x += 1) {
      if (luma[(y * width) + x] < 92) rowDark += 1;
    }
    return rowDark / width > 0.22;
  }).filter(Boolean).length;
  const columnLineCount = Array.from({ length: width }, (_, x) => {
    let columnDark = 0;
    for (let y = 0; y < height; y += 1) {
      if (luma[(y * width) + x] < 92) columnDark += 1;
    }
    return columnDark / height > 0.18;
  }).filter(Boolean).length;
  const gridLineScore = clamp01((rowLineCount / Math.max(height, 1)) * 6 + (columnLineCount / Math.max(width, 1)) * 6);
  const textDensity = clamp01(darkDensity * 1.15 + edgeDensity * 0.22);
  const layoutRisk = clamp01(
    (lightDensity > 0.52 ? 0.22 : 0) +
    (darkDensity > 0.06 ? 0.26 : 0) +
    (edgeDensity > 0.11 ? 0.24 : 0) +
    gridLineScore,
  );
  const reasons: StaticCreativeImageQaReason[] = [];

  if (textDensity > 0.105 || (lightDensity > 0.56 && darkDensity > 0.075)) {
    reasons.push("text_heavy");
  }

  if (gridLineScore > 0.38) {
    reasons.push("chart_or_table_detected");
  }

  if (layoutRisk > 0.72 && reasons.length === 0) {
    reasons.push("fake_ad_layout");
  }

  return { textDensity, layoutRisk, detectedTextSamples: [], reasons: uniq(reasons), textInspectionAvailable: false };
}

function analyzeImage(bytes: Uint8Array, contentType: string): AnalyzeResult {
  if (contentType.includes("svg")) {
    return analyzeSvg(bytes);
  }

  if (contentType.includes("png") || isPng(bytes)) {
    return analyzePng(bytes);
  }

  return { textDensity: 0, layoutRisk: 0, detectedTextSamples: [], reasons: [], textInspectionAvailable: false };
}

async function analyzeFinishedAdImageWithVision(
  input: StaticCreativeImageQaInput,
  fetched: FetchedImage,
  fallbackAnalysis: AnalyzeResult,
): Promise<AnalyzeResult> {
  if (fallbackAnalysis.textInspectionAvailable || !fetched.bytes || !fetched.contentType) {
    return fallbackAnalysis;
  }

  const vision = await inspectFinishedAdWithVisionQa({
    bytes: fetched.bytes,
    contentType: fetched.contentType,
    prompt: input.prompt,
    campaignContext: input.campaignContext,
  });
  const fallbackReasons = vision.available
    ? fallbackAnalysis.reasons.filter((reason) => reason === "gibberish_text_detected")
    : fallbackAnalysis.reasons;

  return {
    textDensity: fallbackAnalysis.textDensity,
    layoutRisk: fallbackAnalysis.layoutRisk,
    detectedTextSamples: vision.textSamples,
    reasons: uniq([...fallbackReasons, ...vision.reasons]),
    textInspectionAvailable: vision.available,
  };
}

function normalizedForSearch(value: string) {
  return safeText(value).toLowerCase().replace(/[^a-z0-9+]+/g, " ").replace(/\s+/g, " ").trim();
}

function requiredPhrasePresent(samples: string[], phrase: string) {
  const normalizedPhrase = normalizedForSearch(phrase);
  if (!normalizedPhrase) {
    return true;
  }

  const haystack = normalizedForSearch(samples.join(" "));
  const words = normalizedPhrase
    .split(" ")
    .filter((word) => word.length > 1)
    .filter((word) => ![
      "the",
      "and",
      "with",
      "that",
      "your",
      "you",
      "may",
      "for",
      "from",
      "into",
      "this",
      "what",
      "options",
      "available",
      "buyers",
    ].includes(word));
  if (words.length === 0) {
    return true;
  }

  const requiredNumericTokens = words.filter((word) => /\d/.test(word));
  if (requiredNumericTokens.some((word) => !haystack.includes(word.replace(/\+$/, "")))) {
    return false;
  }

  const matched = words.filter((word) => haystack.includes(word.replace(/\+$/, ""))).length;
  return matched / words.length >= 0.55;
}

function promptRequiresBrandPresence(prompt?: string) {
  return /\b(brand(?:ed)? text (?:must|required)|must include (?:the )?(?:brokerage|brand)|required brand|logo must appear)\b/i.test(prompt ?? "");
}

function sampleContainsMisspelledBrand(samples: string[], exactPattern: RegExp, fuzzyPattern: RegExp) {
  return samples.some((sample) => fuzzyPattern.test(sample) && !exactPattern.test(sample));
}

function detectBrandMisspelling(samples: string[], prompt?: string) {
  const sourcePrompt = prompt ?? "";
  if (/\bre\s*\/\s*max\b/i.test(sourcePrompt)) {
    const exact = /\bre\s*\/\s*max\b/i;
    const fuzzy = /\bre\s*[-/]?\s*ma+x+\b|\bremx\b|\bremaxx\b/i;

    if (samples.some((sample) => exact.test(sample))) {
      return false;
    }

    if (sampleContainsMisspelledBrand(samples, exact, fuzzy)) {
      return true;
    }

    return promptRequiresBrandPresence(sourcePrompt);
  }

  if (/royal\s+lepage/i.test(sourcePrompt)) {
    const exact = /royal\s+lepage/i;
    const fuzzy = /royal\s+le\s*page|royal\s+page|\blepage\b/i;

    if (samples.some((sample) => exact.test(sample))) {
      return false;
    }

    if (sampleContainsMisspelledBrand(samples, exact, fuzzy)) {
      return true;
    }

    return promptRequiresBrandPresence(sourcePrompt);
  }

  return false;
}

function collectFinishedAdSemanticReasons(input: StaticCreativeImageQaInput, analysis: AnalyzeResult) {
  const reasons: StaticCreativeImageQaReason[] = [];
  const samples = analysis.detectedTextSamples;

  if (!analysis.textInspectionAvailable || samples.length === 0) {
    reasons.push("finished_ad_text_unverified");
    return reasons;
  }

  if (!requiredPhrasePresent(samples, input.campaignContext?.cta ?? "")) {
    reasons.push("required_cta_missing");
  }

  if (!requiredPhrasePresent(samples, input.campaignContext?.offer ?? "")) {
    reasons.push("required_offer_missing");
  }

  if (detectBrandMisspelling(samples, input.prompt)) {
    reasons.push("brand_misspelled");
  }

  return reasons;
}

export async function evaluateStaticCreativeImageQa(
  input: StaticCreativeImageQaInput,
): Promise<StaticCreativeImageQaResult> {
  assertServerSide();

  const mode = normalizeQaMode(input.mode);
  const promptReasons = collectPromptRiskReasons(input, mode);
  const fetched = await fetchImageBytes(input.imageUrl);

  if (!fetched.ok || !fetched.bytes) {
    const reason: StaticCreativeImageQaReason = fetched.timeout ? "qa_timeout" : "image_fetch_failed";
    const reasons = filterReasonsForMode([...promptReasons, reason], mode);
    return {
      usable: false,
      decision: "reject",
      mode,
      reasons,
      textDensity: 0,
      layoutRisk: promptReasons.length > 0 ? 0.7 : 0,
      detectedTextSamples: [],
    };
  }

  const rawAnalysis = analyzeImage(fetched.bytes, fetched.contentType ?? "");
  const analysis = mode === "finished_ad"
    ? await analyzeFinishedAdImageWithVision(input, fetched, rawAnalysis)
    : rawAnalysis;
  const semanticReasons = mode === "finished_ad" ? collectFinishedAdSemanticReasons(input, analysis) : [];
  const reasons = filterReasonsForMode([...promptReasons, ...analysis.reasons, ...semanticReasons], mode);

  if (mode === "background_only" && analysis.textDensity > 0.12 && !reasons.includes("text_heavy")) {
    reasons.push("text_heavy");
  }

  if (mode === "background_only" && analysis.layoutRisk > 0.78 && !reasons.includes("fake_ad_layout")) {
    reasons.push("fake_ad_layout");
  }

  const reject = reasons.length > 0;
  const review = mode === "background_only" && !reject && (analysis.textDensity > 0.075 || analysis.layoutRisk > 0.58);

  return {
    usable: !reject && !review,
    decision: reject ? "reject" : review ? "review" : "accept",
    mode,
    reasons: reject ? reasons : [],
    textDensity: Number(analysis.textDensity.toFixed(4)),
    layoutRisk: Number(analysis.layoutRisk.toFixed(4)),
    detectedTextSamples: analysis.detectedTextSamples.slice(0, 8),
  };
}

export function getCustomerSafeImageQaMessage(result: StaticCreativeImageQaResult | null | undefined) {
  if (!result || result.decision === "accept") {
    return null;
  }

  return "This visual needs a cleaner background. Preview is using the composed layout while the image refreshes.";
}
