import {
  ApiError,
  assertInternalSystemRequest,
  handleApiError,
} from "@/lib/api/route";
import { getSupabaseEnvOrThrow } from "@/lib/env";
import {
  getDeploymentTarget,
  isExplicitNonProductionDeployment,
} from "@/lib/deployment-target";
import { isExactIsolatedSupabaseProject } from "@/lib/security/supabase-isolation";
import { evaluateZeroExternalEffectsEnvironment } from "@/lib/safety/zero-external-effects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function assertIsolatedNonProductionAuthority() {
  if (getDeploymentTarget() === "production" || !isExplicitNonProductionDeployment()) {
    throw new ApiError(
      404,
      "Zero-external-effects proof is available only on an explicitly attested nonproduction target.",
      "zero_external_effects_target_unattested",
    );
  }

  const supabase = getSupabaseEnvOrThrow();
  if (
    !isExactIsolatedSupabaseProject({
      supabaseUrl: supabase.url,
      expectedProjectRef: process.env.QA_ISOLATED_SUPABASE_PROJECT_REF,
    })
  ) {
    throw new ApiError(
      404,
      "Zero-external-effects proof is not authorized for this Supabase project.",
      "zero_external_effects_project_unattested",
    );
  }
}

export async function GET(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertIsolatedNonProductionAuthority();
    const result = evaluateZeroExternalEffectsEnvironment(process.env);
    if (!result.ok) {
      throw new ApiError(
        409,
        `External-effect controls are not fully disabled: ${result.failedControls.join(", ")}`,
        "zero_external_effects_not_proven",
      );
    }

    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "Internal zero-external-effects proof");
  }
}
