import { inflateSync } from "node:zlib";
import type {
  StaticCreativeImageQaReason,
  StaticCreativeImageQaResult,
} from "@/lib/services/static-creative-visual-qa";

export type StaticCreativeImageQaInput = {
  imageUrl: string;
  campaignId: string;
  creativeId?: string;
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
};

const MAX_IMAGE_BYTES = 4_000_000;
const FETCH_TIMEOUT_MS = 5_000;
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

function hasNegation(sentence: string) {
  return /\b(do not|don't|dont|avoid|never|no|without|not a|not an|not the)\b/i.test(sentence);
}

function collectPromptRiskReasons(input: StaticCreativeImageQaInput): StaticCreativeImageQaReason[] {
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

    if (/\b(final ad|finished ad|paid social creative|ad layout|poster|campaign graphic)\b/i.test(sentence)) {
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

function decodeDataUri(uri: string): FetchedImage {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/i.exec(uri);
  if (!match) {
    return { ok: false };
  }

  const contentType = match[1].toLowerCase();
  if (!contentType.startsWith("image/")) {
    return { ok: false, contentType };
  }

  const raw = match[3] ?? "";
  const bytes = match[2]
    ? Buffer.from(raw, "base64")
    : Buffer.from(decodeURIComponent(raw), "utf8");

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, contentType };
  }

  return { ok: true, contentType, bytes };
}

async function fetchImageBytes(url: string): Promise<FetchedImage> {
  if (url.startsWith("data:")) {
    return decodeDataUri(url);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "image/png,image/jpeg,image/webp,image/svg+xml" },
    });
    const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";

    if (!response.ok || !contentType.startsWith("image/")) {
      return { ok: false, contentType };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return { ok: false, contentType };
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          controller.abort();
          return { ok: false, contentType };
        }
        chunks.push(value);
      }
    }

    return { ok: true, contentType, bytes: Buffer.concat(chunks) };
  } catch (error) {
    return {
      ok: false,
      timeout: error instanceof Error && error.name === "AbortError",
    };
  } finally {
    clearTimeout(timeout);
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
    return { textDensity: 0, layoutRisk: 0, detectedTextSamples: [], reasons: [] };
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

  return { textDensity, layoutRisk, detectedTextSamples: [], reasons: uniq(reasons) };
}

function analyzeImage(bytes: Uint8Array, contentType: string): AnalyzeResult {
  if (contentType.includes("svg")) {
    return analyzeSvg(bytes);
  }

  if (contentType.includes("png") || isPng(bytes)) {
    return analyzePng(bytes);
  }

  return { textDensity: 0, layoutRisk: 0, detectedTextSamples: [], reasons: [] };
}

export async function evaluateStaticCreativeImageQa(
  input: StaticCreativeImageQaInput,
): Promise<StaticCreativeImageQaResult> {
  assertServerSide();

  const promptReasons = collectPromptRiskReasons(input);
  const fetched = await fetchImageBytes(input.imageUrl);

  if (!fetched.ok || !fetched.bytes) {
    const reason: StaticCreativeImageQaReason = fetched.timeout ? "qa_timeout" : "image_fetch_failed";
    return {
      usable: false,
      decision: "reject",
      reasons: uniq([...promptReasons, reason]),
      textDensity: 0,
      layoutRisk: promptReasons.length > 0 ? 0.7 : 0,
      detectedTextSamples: [],
    };
  }

  const analysis = analyzeImage(fetched.bytes, fetched.contentType ?? "");
  const reasons = uniq([...promptReasons, ...analysis.reasons]);

  if (analysis.textDensity > 0.12 && !reasons.includes("text_heavy")) {
    reasons.push("text_heavy");
  }

  if (analysis.layoutRisk > 0.78 && !reasons.includes("fake_ad_layout")) {
    reasons.push("fake_ad_layout");
  }

  const reject = reasons.length > 0;
  const review = !reject && (analysis.textDensity > 0.075 || analysis.layoutRisk > 0.58);

  return {
    usable: !reject && !review,
    decision: reject ? "reject" : review ? "review" : "accept",
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
