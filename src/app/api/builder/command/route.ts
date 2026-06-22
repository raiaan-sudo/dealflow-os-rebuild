import { z } from "zod";
import { apiSuccess, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";

const commandSchema = z.object({
  command: z.string().min(1).max(2000),
  campaign: z
    .object({
      headline: z.string().optional(),
      subheadline: z.string().optional(),
      cta: z.string().optional(),
      offer: z.string().optional(),
      location: z.string().optional(),
      audience: z.string().optional(),
    })
    .optional(),
});

function sentenceCase(value: string) {
  const trimmed = value.trim();
  return trimmed ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}` : trimmed;
}

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.length <= 2 && lower !== "to"
        ? lower.toUpperCase()
        : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ")
    .replace(/\bTo\b/g, "to")
    .replace(/\bAnd\b/g, "and");
}

function extractRequestedHeadline(rawCommand: string) {
  const command = rawCommand.trim();
  const lower = command.toLowerCase();

  if (lower.includes("under market") || lower.includes("under-market")) {
    if (lower.includes("get access")) {
      return "Get Access to Under-Market Deals";
    }

    return "Under-Market Deals";
  }

  const headlineMatch =
    command.match(/(?:make (?:this|the) (?:a |an )?|set (?:the )?headline (?:to|as) |headline[: ]+)(.+?)(?: headline| and make| with |$)/i);
  const candidate = headlineMatch?.[1]?.trim();
  if (candidate && candidate.length <= 90) {
    return titleCase(candidate);
  }

  return null;
}

function resolveRequestedCta(rawCommand: string, currentCta?: string) {
  const lower = rawCommand.toLowerCase();

  if (lower.includes("get access")) {
    return "Get Access";
  }

  if (lower.includes("learn more")) {
    return "Learn More";
  }

  return currentCta || "Get Started";
}

function resolveRequestedDirection(rawCommand: string) {
  const lower = rawCommand.toLowerCase();
  const wantsRedBlack = lower.includes("red") && lower.includes("black");
  const wantsLuxury = lower.includes("luxury") || lower.includes("premium");

  if (!wantsRedBlack && !wantsLuxury) {
    return null;
  }

  return {
    themePreset: "luxury",
    mood: wantsLuxury ? "luxury" : "direct-response",
    visualDirection: wantsRedBlack
      ? "red and black luxury real estate landing page with premium contrast and a direct-response conversion path"
      : "luxury real estate landing page with premium contrast and a direct-response conversion path",
    designNotes: [
      wantsRedBlack ? "Use a black base with controlled red accents." : "Use premium contrast and restrained accent color.",
      "Keep the offer and CTA direct, clean, and easy to scan.",
    ],
    typography: {
      display: "refined",
      body: "comfortable",
      label: "premium",
    },
    spacing: {
      hero: "comfortable",
      section: "comfortable",
    },
    palette: {
      background: "#080808",
      surface: "#141414",
      accent: wantsRedBlack ? "#D7262E" : "#D6A66A",
      text: "#F8F5EF",
      mutedText: "rgba(248,245,239,0.74)",
      panel: "#F7F2EA",
      ctaText: "#FFFFFF",
    },
  };
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "builder-command", `${auth.organizationId}:${auth.userId}`),
      limit: 30,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = await parseJsonBody(request, commandSchema);
    const command = body.command.toLowerCase();
    const campaign = body.campaign ?? {};
    const offer = campaign.offer?.trim() || "your next campaign";
    const location = campaign.location?.trim() || "your market";
    const requestedHeadline = extractRequestedHeadline(body.command);
    const requestedCta = resolveRequestedCta(body.command, campaign.cta);
    const requestedDirection = resolveRequestedDirection(body.command);

    const funnelPatch = {
      headline: requestedHeadline
        ? requestedHeadline
        : command.includes("headline")
        ? sentenceCase(body.command.replace(/^rewrite\s+/i, "").slice(0, 90))
        : campaign.headline || `Launch ${offer} in ${location}`,
      subheadline:
        campaign.subheadline ||
        `A focused campaign path for ${campaign.audience?.trim() || "qualified leads"} with clear next steps.`,
      cta: command.includes("call") ? "Book My Strategy Call" : requestedCta,
    };

    return apiSuccess({
      summary: "Applied a deterministic builder update.",
      changes: [
        "Updated funnel headline and CTA from the requested direction.",
        ...(requestedDirection ? ["Applied the requested visual direction to the preview."] : []),
      ],
      direction: requestedDirection,
      creativePatch: {
        visualDirection: requestedDirection?.visualDirection ?? null,
        imagePromptAppend: requestedDirection?.visualDirection ?? null,
      },
      funnelPatch,
    });
  } catch (error) {
    return handleApiError(error, "Builder command");
  }
}
