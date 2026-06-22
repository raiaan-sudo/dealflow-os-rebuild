import { ApiError } from "@/lib/api/route";

export type GhlContactPayload = {
  locationId: string;
  firstName: string;
  lastName: string;
  name: string;
  email?: string;
  phone?: string;
  source: string;
  tags: string[];
  customFields: Array<{ key: string; field_value: string }>;
};

export type GhlOpportunityPayload = {
  locationId: string;
  pipelineId: string;
  stageId: string;
  contactId: string;
  name: string;
  source: string;
  status?: "open" | "won" | "lost" | "abandoned";
};

export type GhlWorkflowEnrollmentPayload = {
  contactId: string;
  workflowId: string;
};

export type GhlLocationProvisioningPayload = {
  name: string;
  companyId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  timezone?: string | null;
  snapshotId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type GhlUserProvisioningPayload = {
  locationId: string;
  companyId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role?: "user" | "admin" | string;
  type?: "account" | "agency" | string;
  permissions?: Record<string, boolean>;
};

export type GhlLocationSummary = {
  id?: string;
  name?: string;
  business?: {
    name?: string;
  };
  companyId?: string;
};

export type GhlPipelineStageSummary = {
  id?: string;
  _id?: string;
  name?: string;
  title?: string;
};

export type GhlPipelineSummary = {
  id?: string;
  _id?: string;
  name?: string;
  title?: string;
  stages?: GhlPipelineStageSummary[];
};

export type GhlWorkflowSummary = {
  id?: string;
  _id?: string;
  name?: string;
  title?: string;
  status?: string;
};

type GhlRequestOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
};

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "v3";

function normalizeCredentialEnvKey(ref: string) {
  return ref.trim().replace(/[^A-Z0-9_]/gi, "_").toUpperCase();
}

function normalizeToken(value: string | undefined) {
  const token = value?.trim();

  if (!token) {
    return null;
  }

  return token.replace(/^Bearer\s+/i, "").trim() || null;
}

export function getGhlPrivateTokenFromCredentialRef(ref: string) {
  const normalized = normalizeCredentialEnvKey(ref);
  const token = normalizeToken(process.env[normalized]);

  if (token) {
    return token;
  }

  if (
    normalized === "CLICKTOSCALE_GHL_PRIVATE_INTEGRATION" ||
    normalized === "GHL_CLICK_TO_SCALE_PRIVATE_INTEGRATION_TOKEN"
  ) {
    return (
      normalizeToken(process.env.CLICKTOSCALE_GHL_PRIVATE_INTEGRATION) ||
      normalizeToken(process.env.GHL_CLICK_TO_SCALE_PRIVATE_INTEGRATION_TOKEN) ||
      normalizeToken(process.env.GHL_PRIVATE_INTEGRATION_TOKEN) ||
      null
    );
  }

  return null;
}

function classifyGhlStatus(status: number) {
  if (status === 401 || status === 403) {
    return "ghl_auth_failed";
  }

  if (status === 429) {
    return "ghl_rate_limited";
  }

  if (status >= 500) {
    return "ghl_unavailable";
  }

  return "ghl_request_failed";
}

export class GoHighLevelClient {
  private readonly token: string;

  constructor(params: { token: string }) {
    this.token = params.token;
  }

  async request<T>(path: string, options: GhlRequestOptions = {}) {
    const response = await fetch(`${GHL_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Version: GHL_API_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const payload = (await response.json().catch(() => null)) as T | { message?: string; error?: string } | null;

    if (!response.ok) {
      const message =
        (payload && typeof payload === "object" && "message" in payload && payload.message) ||
        (payload && typeof payload === "object" && "error" in payload && payload.error) ||
        `GoHighLevel request failed with status ${response.status}.`;
      throw new ApiError(response.status, message, classifyGhlStatus(response.status));
    }

    return payload as T;
  }

  async upsertContact(payload: GhlContactPayload) {
    const result = await this.request<{ contact?: { id?: string }; id?: string }>("/contacts/upsert", {
      method: "POST",
      body: payload,
    });

    const id = result?.contact?.id ?? result?.id ?? null;
    if (!id) {
      throw new ApiError(502, "GoHighLevel contact upsert response did not include an ID.", "ghl_contact_upsert_failed");
    }

    return id;
  }

  async createOpportunity(payload: GhlOpportunityPayload) {
    const result = await this.request<{ opportunity?: { id?: string }; id?: string }>("/opportunities/", {
      method: "POST",
      body: {
        locationId: payload.locationId,
        pipelineId: payload.pipelineId,
        pipelineStageId: payload.stageId,
        contactId: payload.contactId,
        name: payload.name,
        source: payload.source,
        status: payload.status ?? "open",
      },
    });

    const id = result?.opportunity?.id ?? result?.id ?? null;
    if (!id) {
      throw new ApiError(502, "GoHighLevel opportunity response did not include an ID.", "ghl_opportunity_failed");
    }

    return id;
  }

  async addContactToWorkflow(payload: GhlWorkflowEnrollmentPayload) {
    const result = await this.request<{ succeeded?: boolean; success?: boolean; message?: string; id?: string }>(
      `/contacts/${encodeURIComponent(payload.contactId)}/workflow/${encodeURIComponent(payload.workflowId)}`,
      {
        method: "POST",
      },
    );

    return {
      workflowId: payload.workflowId,
      enrollmentId: result?.id ?? null,
      success: result?.success ?? result?.succeeded ?? true,
      message: result?.message ?? null,
    };
  }

  async getLocation(locationId: string) {
    return await this.request<{ location?: GhlLocationSummary } | GhlLocationSummary>(
      `/locations/${encodeURIComponent(locationId)}`,
      { method: "GET" },
    );
  }

  async getPipelines(locationId: string) {
    const payload = await this.request<{ pipelines?: GhlPipelineSummary[] }>(
      `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      { method: "GET" },
    );

    return Array.isArray(payload?.pipelines) ? payload.pipelines : [];
  }

  async getWorkflows(locationId: string) {
    const payload = await this.request<{ workflows?: GhlWorkflowSummary[]; workflow?: GhlWorkflowSummary[] }>(
      `/workflows/?locationId=${encodeURIComponent(locationId)}`,
      { method: "GET" },
    );

    if (Array.isArray(payload?.workflows)) {
      return payload.workflows;
    }

    return Array.isArray(payload?.workflow) ? payload.workflow : [];
  }

  async createLocation(payload: GhlLocationProvisioningPayload) {
    const result = await this.request<{ location?: { id?: string }; id?: string }>("/locations/", {
      method: "POST",
      body: {
        name: payload.name,
        ...(payload.companyId ? { companyId: payload.companyId } : {}),
        ...(payload.email ? { email: payload.email } : {}),
        ...(payload.phone ? { phone: payload.phone } : {}),
        ...(payload.address ? { address: payload.address } : {}),
        ...(payload.city ? { city: payload.city } : {}),
        ...(payload.state ? { state: payload.state } : {}),
        ...(payload.country ? { country: payload.country } : {}),
        ...(payload.postalCode ? { postalCode: payload.postalCode } : {}),
        ...(payload.timezone ? { timezone: payload.timezone } : {}),
        ...(payload.snapshotId ? { snapshotId: payload.snapshotId } : {}),
        ...(payload.metadata ? { metadata: payload.metadata } : {}),
      },
    });

    const id = result?.location?.id ?? result?.id ?? null;
    if (!id) {
      throw new ApiError(502, "GoHighLevel location response did not include an ID.", "ghl_location_create_failed");
    }

    return id;
  }

  async createUser(payload: GhlUserProvisioningPayload) {
    const result = await this.request<{ user?: { id?: string }; id?: string }>("/users/", {
      method: "POST",
      body: {
        locationId: payload.locationId,
        ...(payload.companyId ? { companyId: payload.companyId } : {}),
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        role: payload.role ?? "user",
        type: payload.type ?? "account",
        ...(payload.permissions ? { permissions: payload.permissions } : {}),
      },
    });

    const id = result?.user?.id ?? result?.id ?? null;
    if (!id) {
      throw new ApiError(502, "GoHighLevel user response did not include an ID.", "ghl_user_create_failed");
    }

    return id;
  }
}
