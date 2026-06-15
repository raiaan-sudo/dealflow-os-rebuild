import { ApiError } from "@/lib/api/route";

export type GhlAuthConfig = {
  credentialRef: string;
  locationId: string;
};

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
};

export type GhlLocationProvisioningPayload = {
  name: string;
  companyId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
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
  firstName: string;
  lastName: string;
  email: string;
  role?: "user" | "admin" | string;
  type?: "account" | "agency" | string;
  permissions?: Record<string, boolean>;
};

type GhlRequestOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
};

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

function normalizeCredentialEnvKey(ref: string) {
  return ref.trim().replace(/[^A-Z0-9_]/gi, "_").toUpperCase();
}

export function getGhlPrivateTokenFromCredentialRef(ref: string) {
  const normalized = normalizeCredentialEnvKey(ref);
  const normalizeToken = (value: string | undefined) => {
    const token = value?.trim();

    if (!token) {
      return null;
    }

    return token.replace(/^Bearer\s+/i, "").trim() || null;
  };
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

  async searchContact(params: { locationId: string; email?: string | null; phone?: string | null }) {
    const filters = [
      params.phone ? { field: "phone", operator: "eq", value: params.phone } : null,
      params.email ? { field: "email", operator: "eq", value: params.email } : null,
    ].filter(Boolean);

    if (filters.length === 0) {
      return null;
    }

    const result = await this.request<{ contacts?: Array<{ id: string }> }>("/contacts/search", {
      method: "POST",
      body: {
        locationId: params.locationId,
        page: 1,
        pageLimit: 1,
        filters,
      },
    });

    return result?.contacts?.[0]?.id ?? null;
  }

  async createContact(payload: GhlContactPayload) {
    const result = await this.request<{ contact?: { id?: string }; id?: string }>("/contacts/", {
      method: "POST",
      body: payload,
    });

    const id = result?.contact?.id ?? result?.id ?? null;
    if (!id) {
      throw new ApiError(502, "GoHighLevel contact response did not include an ID.", "ghl_contact_upsert_failed");
    }

    return id;
  }

  async updateContact(contactId: string, payload: GhlContactPayload) {
    const result = await this.request<{ contact?: { id?: string }; id?: string }>(`/contacts/${contactId}`, {
      method: "PUT",
      body: payload,
    });

    return result?.contact?.id ?? result?.id ?? contactId;
  }

  async upsertContact(payload: GhlContactPayload) {
    const existingId = await this.searchContact({
      locationId: payload.locationId,
      email: payload.email,
      phone: payload.phone,
    });

    if (existingId) {
      return this.updateContact(existingId, payload);
    }

    return this.createContact(payload);
  }

  async createOpportunity(payload: GhlOpportunityPayload) {
    const result = await this.request<{ opportunity?: { id?: string }; id?: string }>("/opportunities/", {
      method: "POST",
      body: {
        locationId: payload.locationId,
        pipelineId: payload.pipelineId,
        stageId: payload.stageId,
        contactId: payload.contactId,
        name: payload.name,
        source: payload.source,
      },
    });

    const id = result?.opportunity?.id ?? result?.id ?? null;
    if (!id) {
      throw new ApiError(502, "GoHighLevel opportunity response did not include an ID.", "ghl_opportunity_failed");
    }

    return id;
  }

  async createLocation(payload: GhlLocationProvisioningPayload) {
    const result = await this.request<{ location?: { id?: string }; id?: string }>("/locations/", {
      method: "POST",
      body: {
        name: payload.name,
        ...(payload.companyId ? { companyId: payload.companyId } : {}),
        ...(payload.firstName ? { firstName: payload.firstName } : {}),
        ...(payload.lastName ? { lastName: payload.lastName } : {}),
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
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        locationIds: [payload.locationId],
        role: payload.role ?? "user",
        type: payload.type ?? "account",
        permissions: payload.permissions ?? {
          contactsEnabled: true,
          opportunitiesEnabled: true,
          campaignsEnabled: false,
          workflowsEnabled: false,
          settingsEnabled: false,
        },
      },
    });

    const id = result?.user?.id ?? result?.id ?? null;
    if (!id) {
      throw new ApiError(502, "GoHighLevel user response did not include an ID.", "ghl_user_create_failed");
    }

    return id;
  }
}
