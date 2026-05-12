import { getAiEnv } from "@/lib/env";
import type { StaticCreativeImageQaReason } from "@/lib/services/static-creative-visual-qa";

export type FinishedAdVisionQaInput = {
  bytes: Uint8Array;
  contentType: string;
  prompt?: string;
  campaignContext?: {
    offer?: string;
    cta?: string;
    market?: string;
    audience?: string;
  };
};

export type FinishedAdVisionQaResult = {
  ok: boolean;
  available: boolean;
  textSamples: string[];
  reasons: StaticCreativeImageQaReason[];
  error?: string | null;
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stripTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeContentType(contentType: string) {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalized === "image/jpg") {
    return "image/jpeg";
  }
  return normalized;
}

function supportsVisionInspection(contentType: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(normalizeContentType(contentType));
}

function toDataUrl(bytes: Uint8Array, contentType: string) {
  return `data:${normalizeContentType(contentType)};base64,${Buffer.from(bytes).toString("base64")}`;
}

function parseBoolean(value: unknown) {
  return value === true ? true : value === false ? false : null;
}

function parseTextSamples(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => safeText(item))
    .filter(Boolean)
    .slice(0, 24);
}

function collectReasons(payload: Record<string, unknown>): StaticCreativeImageQaReason[] {
  const reasons: StaticCreativeImageQaReason[] = [];

  if (parseBoolean(payload.hasGibberish) === true) {
    reasons.push("gibberish_text_detected");
  }

  if (parseBoolean(payload.hasFakeUi) === true) {
    reasons.push("ui_or_dashboard_layout");
  }

  if (parseBoolean(payload.hasListingOrDashboard) === true) {
    reasons.push("listing_sheet_detected");
  }

  if (parseBoolean(payload.hasChartOrTable) === true) {
    reasons.push("chart_or_table_detected");
  }

  if (parseBoolean(payload.brandMisspelled) === true) {
    reasons.push("brand_misspelled");
  }

  if (parseBoolean(payload.requiredCtaPresent) === false) {
    reasons.push("required_cta_missing");
  }

  if (parseBoolean(payload.requiredOfferPresent) === false) {
    reasons.push("required_offer_missing");
  }

  return Array.from(new Set(reasons));
}

export async function inspectFinishedAdWithVisionQa(
  input: FinishedAdVisionQaInput,
): Promise<FinishedAdVisionQaResult> {
  if (process.env.FINISHED_AD_VISION_QA_ENABLED !== "true") {
    return {
      ok: false,
      available: false,
      textSamples: [],
      reasons: ["finished_ad_text_unverified"],
      error: "Finished-ad vision QA is disabled.",
    };
  }

  const env = getAiEnv();
  if (!env) {
    return {
      ok: false,
      available: false,
      textSamples: [],
      reasons: ["finished_ad_text_unverified"],
      error: "Finished-ad vision QA provider is not configured.",
    };
  }

  if (!supportsVisionInspection(input.contentType)) {
    return {
      ok: false,
      available: false,
      textSamples: [],
      reasons: ["finished_ad_text_unverified"],
      error: "Finished-ad raster type is not supported by vision QA.",
    };
  }

  const model = process.env.FINISHED_AD_VISION_QA_MODEL?.trim() || process.env.AI_VISION_MODEL?.trim() || env.model;

  try {
    const response = await fetch(`${stripTrailingSlash(env.baseUrl)}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You inspect final paid-social ad rasters for launch QA. Return only JSON with keys readableTextSamples, hasGibberish, hasFakeUi, hasListingOrDashboard, hasChartOrTable, brandMisspelled, requiredCtaPresent, requiredOfferPresent. A normal poster-style CTA button or CTA bar is allowed. Be strict about gibberish, misspellings, fake dashboard/listing/table UI, charts, data panels, and missing required offer or CTA.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  `Prompt: ${safeText(input.prompt) || "not provided"}`,
                  `Required offer: ${safeText(input.campaignContext?.offer) || "none"}`,
                  `Required CTA: ${safeText(input.campaignContext?.cta) || "none"}`,
                  `Market: ${safeText(input.campaignContext?.market) || "none"}`,
                  `Audience: ${safeText(input.campaignContext?.audience) || "none"}`,
                ].join("\n"),
              },
              {
                type: "image_url",
                image_url: {
                  url: toDataUrl(input.bytes, input.contentType),
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        available: false,
        textSamples: [],
        reasons: ["finished_ad_text_unverified"],
        error: `Finished-ad vision QA request failed with status ${response.status}.`,
      };
    }

    const data = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    } | null;
    const content = data?.choices?.[0]?.message?.content ?? null;
    const payload = content ? JSON.parse(content) as Record<string, unknown> : null;

    if (!payload) {
      throw new Error("Finished-ad vision QA returned an empty response.");
    }

    const textSamples = parseTextSamples(payload.readableTextSamples);
    const reasons = collectReasons(payload);

    return {
      ok: true,
      available: true,
      textSamples,
      reasons: textSamples.length > 0 ? reasons : Array.from(new Set([...reasons, "finished_ad_text_unverified"])),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      available: false,
      textSamples: [],
      reasons: ["finished_ad_text_unverified"],
      error: error instanceof Error ? error.message : "Finished-ad vision QA failed.",
    };
  }
}
