import { z } from "zod";
import { apiSuccess, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
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

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    await getAuthenticatedContext();
    const body = await parseJsonBody(request, commandSchema);
    const command = body.command.toLowerCase();
    const campaign = body.campaign ?? {};
    const offer = campaign.offer?.trim() || "your next campaign";
    const location = campaign.location?.trim() || "your market";

    const funnelPatch = {
      headline: command.includes("headline")
        ? sentenceCase(body.command.replace(/^rewrite\s+/i, ""))
        : campaign.headline || `Launch ${offer} in ${location}`,
      subheadline:
        campaign.subheadline ||
        `A focused campaign path for ${campaign.audience?.trim() || "qualified leads"} with clear next steps.`,
      cta: command.includes("call") ? "Book My Strategy Call" : campaign.cta || "Get Started",
    };

    return apiSuccess({
      summary: "Applied a deterministic builder update.",
      changes: ["Updated funnel headline, subheadline, and CTA from the saved campaign context."],
      direction: null,
      creativePatch: {
        visualDirection: null,
        imagePromptAppend: null,
      },
      funnelPatch,
    });
  } catch (error) {
    return handleApiError(error, "Builder command");
  }
}
