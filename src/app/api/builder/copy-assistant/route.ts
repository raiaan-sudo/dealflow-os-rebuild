import {
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseOptionalJsonBody,
} from "@/lib/api/route";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { generateCreativeCopyAssistant } from "@/lib/services/copy-engine";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    await getAuthenticatedContext();
    const body = await parseOptionalJsonBody(request, { parse: (input) => input }, {});
    const assistant = generateCreativeCopyAssistant(body as never);

    return apiSuccess(assistant);
  } catch (error) {
    return handleApiError(error, "Builder copy assistant");
  }
}
