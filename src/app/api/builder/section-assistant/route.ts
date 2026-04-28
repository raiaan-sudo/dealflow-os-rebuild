import { z } from "zod";
import { apiSuccess, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";

const sectionAssistantSchema = z.object({
  action: z.string().min(1).max(100),
  section: z
    .object({
      title: z.string().optional(),
      content: z.array(z.string()).optional(),
      variant: z.string().optional(),
    })
    .passthrough(),
  campaignContext: z
    .object({
      offer: z.string().optional(),
      location: z.string().optional(),
      audience: z.string().optional(),
      funnelCta: z.string().optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    await getAuthenticatedContext();
    const body = await parseJsonBody(request, sectionAssistantSchema);
    const context = body.campaignContext ?? {};
    const title = body.section.title?.trim() || "Campaign section";
    const content = body.section.content?.filter(Boolean) ?? [];
    const offer = context.offer?.trim() || "the campaign offer";
    const audience = context.audience?.trim() || "the target audience";
    const action = body.action.toLowerCase();

    const nextContent =
      action.includes("short")
        ? content.slice(0, 3)
        : action.includes("proof")
          ? [...content, `Proof point: ${offer} is positioned for ${audience}.`]
          : content.length > 0
            ? content.map((line) => (line.endsWith(".") ? line : `${line}.`))
            : [`Explain why ${offer} matters to ${audience}.`];

    return apiSuccess({
      title,
      content: nextContent,
      variant: body.section.variant || "guided",
      label: "Section updated",
      caption: "Generated locally without calling a paid AI provider.",
    });
  } catch (error) {
    return handleApiError(error, "Builder section assistant");
  }
}
