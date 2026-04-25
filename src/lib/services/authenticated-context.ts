import { ApiError } from "@/lib/api/route";
import { getAppContext } from "@/lib/services/app-context";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export async function getAuthenticatedContext() {
  const [context, supabase] = await Promise.all([getAppContext(), createRouteHandlerClient()]);

  if (!context) {
    throw new ApiError(401, "Authentication is required.", "unauthorized");
  }

  if (!supabase) {
    throw new ApiError(401, "Authentication is required.", "unauthorized");
  }

  return {
    context,
    supabase,
    userId: context.user.id,
    organizationId: context.organization.id,
  };
}
