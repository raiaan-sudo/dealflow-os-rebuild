import { NextResponse } from "next/server";
import { ApiError, assertSameOriginRequest } from "@/lib/api/route";
import { createMetaFailureResponse } from "@/lib/integrations/meta/error-mapper";
import {
  getMetaConnectionState,
  selectMetaAdAccount,
  updateMetaLaunchSelections,
} from "@/lib/integrations/meta/service";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";

type SelectionBody = {
  externalAccountId?: string;
  pageId?: string;
  pixelId?: string;
};

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOriginRequest(request);
    await getAuthenticatedContext();

    const body = (await request.json().catch(() => null)) as SelectionBody | null;
    const externalAccountId = body?.externalAccountId?.trim() ?? "";
    const pageId = body?.pageId?.trim() ?? "";
    const pixelId = body?.pixelId?.trim() ?? "";

    if (!externalAccountId) {
      return NextResponse.json(
        { error: "A Meta ad account selection is required." },
        { status: 400 },
      );
    }

    let connection =
      pageId && pixelId
        ? await updateMetaLaunchSelections({
            externalAccountId,
            pageId,
            pixelId,
          })
        : await selectMetaAdAccount(externalAccountId);

    if (!connection) {
      connection = await getMetaConnectionState();
    }

    return NextResponse.json({ connection });
  } catch (error) {
    return createMetaFailureResponse({
      context: "selection",
      status: error instanceof ApiError ? error.status : 400,
      requestId,
      error,
    });
  }
}
