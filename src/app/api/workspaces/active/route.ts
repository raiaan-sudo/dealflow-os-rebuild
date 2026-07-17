import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  ACTIVE_WORKSPACE_COOKIE,
  WORKSPACE_ID_PATTERN,
} from "@/lib/services/app-context";
import { hasWorkspaceMembership } from "@/lib/services/workspace-selection-service";

const requestSchema = z
  .object({
    organizationId: z.string().regex(WORKSPACE_ID_PATTERN, "Select a valid workspace."),
  })
  .strict();

const ACTIVE_WORKSPACE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

async function requireAuthenticatedClient(response: NextResponse) {
  const supabase = await createServerSupabase(response);
  if (!supabase) {
    throw new ApiError(503, "Workspace selection is unavailable.", "workspace_config_missing");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError(401, "Authentication is required.", "unauthorized");
  }
  return { supabase, user };
}

export async function POST(request: Request) {
  const response = NextResponse.json({ success: true });
  try {
    assertSameOriginRequest(request);
    const input = await parseJsonBody(request, requestSchema);
    const { supabase, user } = await requireAuthenticatedClient(response);
    if (!(await hasWorkspaceMembership(supabase, user.id, input.organizationId))) {
      throw new ApiError(
        403,
        "The selected workspace is not available to this user.",
        "workspace_selection_denied",
      );
    }
    response.cookies.set(
      ACTIVE_WORKSPACE_COOKIE,
      input.organizationId,
      ACTIVE_WORKSPACE_COOKIE_OPTIONS,
    );
    return response;
  } catch (error) {
    return handleApiError(error, "Active workspace selection");
  }
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ success: true });
  try {
    assertSameOriginRequest(request);
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, "", {
      ...ACTIVE_WORKSPACE_COOKIE_OPTIONS,
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return handleApiError(error, "Active workspace reset");
  }
}
