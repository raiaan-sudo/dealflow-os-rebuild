import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertInternalSystemRequest,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import {
  getGhlPrivateTokenFromCredentialRef,
  GoHighLevelClient,
} from "@/lib/integrations/gohighlevel/client";
import { readWorkspaceGhlConfig } from "@/lib/services/partner-crm-sync-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TARGET_WORKSPACE_ID = "2e3b0144-23a9-483a-9e11-61173b4099c4";
const TARGET_PARTNER_ID = "1b22d077-1f54-4327-ba48-1b1b793488a1";
const TARGET_LOCATION_ID = "ehLH5WjzfEaztUXBDG3i";

const bodySchema = z.object({
  proofRunId: z.literal("ghl_opportunity_v1_20260618_01"),
}).strict();

type PipelineStage = {
  id?: string;
  _id?: string;
  name?: string;
  title?: string;
};

type Pipeline = {
  id?: string;
  _id?: string;
  name?: string;
  title?: string;
  stages?: PipelineStage[];
};

type PipelinePayload = {
  pipelines?: Pipeline[];
};

function assertProofEnabled() {
  if (process.env.GHL_OPPORTUNITY_DISCOVERY_PROOF_ENABLED !== "true") {
    throw new ApiError(404, "GHL opportunity discovery proof is not enabled.", "ghl_opportunity_discovery_disabled");
  }
}

function maskExternalId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : "***";
}

function stageSummary(stage: PipelineStage) {
  return {
    id: stage.id ?? stage._id ?? null,
    idMasked: maskExternalId(stage.id ?? stage._id),
    name: stage.name ?? stage.title ?? null,
  };
}

function pipelineSummary(pipeline: Pipeline) {
  return {
    id: pipeline.id ?? pipeline._id ?? null,
    idMasked: maskExternalId(pipeline.id ?? pipeline._id),
    name: pipeline.name ?? pipeline.title ?? null,
    stages: Array.isArray(pipeline.stages) ? pipeline.stages.map(stageSummary) : [],
  };
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertSameOriginRequest(request);
    assertProofEnabled();

    const input = await parseJsonBody(request, bodySchema, {
      code: "ghl_opportunity_discovery_body_invalid",
    });
    const config = await readWorkspaceGhlConfig({
      workspaceId: TARGET_WORKSPACE_ID,
      partnerId: TARGET_PARTNER_ID,
    });

    if (!config) {
      throw new ApiError(409, "Target workspace GHL config could not be resolved.", "ghl_config_unresolved");
    }

    if (config.locationId !== TARGET_LOCATION_ID) {
      throw new ApiError(409, "Resolved GHL location does not match the approved proof target.", "ghl_location_mismatch");
    }

    const token = getGhlPrivateTokenFromCredentialRef(config.credentialRef);
    if (!token) {
      throw new ApiError(409, "GHL credential reference is configured but server token is missing.", "ghl_auth_missing");
    }

    const ghl = new GoHighLevelClient({ token });
    const payload = await ghl.request<PipelinePayload>(
      `/opportunities/pipelines?locationId=${encodeURIComponent(TARGET_LOCATION_ID)}`,
      { method: "GET" },
    );
    const pipelines = Array.isArray(payload?.pipelines) ? payload.pipelines.map(pipelineSummary) : [];

    return apiSuccess({
      success: true,
      proofRunId: input.proofRunId,
      target: {
        workspaceId: TARGET_WORKSPACE_ID,
        partnerId: TARGET_PARTNER_ID,
        locationId: TARGET_LOCATION_ID,
      },
      resolved: {
        configResolved: true,
        locationConfigured: config.locationId === TARGET_LOCATION_ID,
        currentPipelineId: config.pipelineId,
        currentStageId: config.stageId,
        credentialConfigured: Boolean(config.credentialRef),
      },
      pipelines,
      safety: {
        internalBearerRequired: true,
        sameOriginRequired: true,
        envGate: "GHL_OPPORTUNITY_DISCOVERY_PROOF_ENABLED",
        readOnlyGhlRequest: true,
        dbMutation: false,
        ghlContactWrite: false,
        ghlOpportunityWrite: false,
        provisioning: false,
        workflowEnrollment: false,
        tokensExposed: false,
        credentialRefsExposed: false,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "GHL opportunity discovery proof");
  }
}
