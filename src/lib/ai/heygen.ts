import { getVideoGenerationEnv } from "@/lib/env";

type HeyGenCreateRequest = {
  script: string;
  avatarId?: string | null;
  voiceId?: string | null;
  title?: string | null;
  aspectRatio?: "9:16" | "16:9";
  resolution?: "720p" | "1080p";
};

export type HeyGenCreateResult = {
  videoId: string;
  status: string | null;
  avatarId: string;
  voiceId: string;
  raw: Record<string, unknown> | null;
};

export type HeyGenVideoStatusResult = {
  videoId: string;
  status: "pending" | "waiting" | "processing" | "completed" | "failed" | "unknown";
  videoUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  raw: Record<string, unknown> | null;
};

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function extractHeyGenErrorMessage(data: Record<string, unknown> | null) {
  if (!data) {
    return "";
  }

  const topLevel = safeText(data.message);
  if (topLevel) {
    return topLevel;
  }

  const errorValue = data.error;
  if (errorValue && typeof errorValue === "object") {
    const errorRecord = errorValue as Record<string, unknown>;
    const nestedMessage = safeText(errorRecord.message);
    const nestedCode = safeText(errorRecord.code);

    if (nestedMessage && nestedCode) {
      return `${nestedMessage} (${nestedCode})`;
    }

    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return "";
}

function normalizeHeyGenStatus(value: unknown): HeyGenVideoStatusResult["status"] {
  const status = safeText(value).toLowerCase();

  if (status === "pending" || status === "waiting" || status === "processing" || status === "completed" || status === "failed") {
    return status;
  }

  return "unknown";
}

async function parseJsonSafe(response: Response) {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

function getNestedRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizeProviderDiagnosticText(value: unknown) {
  const text = safeText(value)
    .replace(/https?:\/\/\S+/gi, "[redacted_url]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted_email]")
    .replace(/\b(sk|pk|rk|key|token|bearer)_[A-Za-z0-9_-]{12,}\b/gi, "[redacted_secret]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi, "Bearer [redacted_secret]")
    .trim();

  return text ? text.slice(0, 240) : null;
}

function buildSafeHeyGenDiagnostic(params: {
  videoId: string | null;
  status: string | null;
  data: Record<string, unknown> | null;
}) {
  const payload = getNestedRecord(params.data?.data) ?? params.data ?? {};
  const errorValue = getNestedRecord(payload.error);

  return {
    provider: "heygen",
    videoId: params.videoId,
    providerStatus: params.status,
    hasVideoUrl: Boolean(
      safeText(payload.video_url) ||
        safeText(payload.url) ||
        safeText(getNestedRecord(payload.video)?.url),
    ),
    hasThumbnailUrl: Boolean(
      safeText(payload.thumbnail_url) ||
        safeText(payload.cover_url),
    ),
    errorCode: sanitizeProviderDiagnosticText(errorValue?.code),
    errorMessage:
      sanitizeProviderDiagnosticText(payload.error_message) ||
      sanitizeProviderDiagnosticText(errorValue?.message) ||
      sanitizeProviderDiagnosticText(params.data?.message) ||
      null,
  };
}

function looksMaskedApiKey(value: string | null | undefined) {
  const normalized = safeText(value);
  return normalized.startsWith("...") || normalized.includes("***");
}

function getHeyGenConfig() {
  const env = getVideoGenerationEnv();

  if (process.env.ALLOW_HEYGEN_VIDEO_GENERATION !== "true") {
    throw new Error("HeyGen video generation is disabled until the provider usage guard is explicitly enabled.");
  }

  if (!env?.apiKey) {
    throw new Error("Missing HEYGEN_API_KEY");
  }

  if (looksMaskedApiKey(env.apiKey)) {
    throw new Error("HEYGEN_API_KEY appears masked or incomplete. Paste the full live API key into .env.local.");
  }

  return {
    apiKey: env.apiKey,
    baseUrl: env.baseUrl.replace(/\/$/, ""),
    avatarId: env.avatarId,
    voiceId: env.voiceId,
  };
}

async function heyGenRequest(path: string, init?: RequestInit) {
  const config = getHeyGenConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": config.apiKey,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });

  return {
    response,
    data: await parseJsonSafe(response),
  };
}

function findFirstId(value: unknown, candidates: string[]): string | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstId(item, candidates);
      if (found) {
        return found;
      }
    }

    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    for (const key of candidates) {
      const found = safeText(record[key]);
      if (found) {
        return found;
      }
    }

    for (const nested of Object.values(record)) {
      const found = findFirstId(nested, candidates);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function normalizePreferredId(value?: string | null) {
  const normalized = safeText(value);
  return !normalized || normalized.toLowerCase() === "default" ? null : normalized;
}

async function resolveAvatarId(preferred?: string | null) {
  const config = getHeyGenConfig();
  const explicit = normalizePreferredId(preferred) ?? normalizePreferredId(config.avatarId);

  if (explicit) {
    return explicit;
  }

  const { response, data } = await heyGenRequest("/v2/avatars", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      extractHeyGenErrorMessage(data) || "Unable to retrieve HeyGen avatars.",
    );
  }

  const avatarId =
    findFirstId(data?.data, ["avatar_id", "id"]) ??
    findFirstId(data, ["avatar_id", "id"]);

  if (!avatarId) {
    throw new Error("No HeyGen avatar_id is available for video generation.");
  }

  return avatarId;
}

async function resolveVoiceId(preferred?: string | null) {
  const config = getHeyGenConfig();
  const explicit = normalizePreferredId(preferred) ?? normalizePreferredId(config.voiceId);

  if (explicit) {
    return explicit;
  }

  const { response, data } = await heyGenRequest("/v2/voices", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      extractHeyGenErrorMessage(data) || "Unable to retrieve HeyGen voices.",
    );
  }

  const voiceId =
    findFirstId(data?.data, ["voice_id", "id"]) ??
    findFirstId(data, ["voice_id", "id"]);

  if (!voiceId) {
    throw new Error("No HeyGen voice_id is available for video generation.");
  }

  return voiceId;
}

export async function createHeyGenVideo(request: HeyGenCreateRequest) {
  const script = safeText(request.script);

  if (script.length < 10) {
    throw new Error("Script too short");
  }

  const [avatarId, voiceId] = await Promise.all([
    resolveAvatarId(request.avatarId),
    resolveVoiceId(request.voiceId),
  ]);

  const dimension =
    request.aspectRatio === "16:9"
      ? request.resolution === "1080p"
        ? { width: 1920, height: 1080 }
        : { width: 1280, height: 720 }
      : request.resolution === "1080p"
        ? { width: 1080, height: 1920 }
        : { width: 720, height: 1280 };

  const { response, data } = await heyGenRequest("/v2/video/generate", {
    method: "POST",
    body: JSON.stringify({
      title: safeText(request.title) || "Campaign video ad",
      caption: false,
      dimension,
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: avatarId,
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: script,
            voice_id: voiceId,
          },
          background: {
            type: "color",
            value: "#0f172a",
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(extractHeyGenErrorMessage(data) || "HeyGen request failed");
  }

  const videoId =
    safeText(data?.data && (data.data as Record<string, unknown>).video_id) ||
    safeText(data?.video_id);

  if (!videoId) {
    throw new Error("HeyGen did not return a video_id.");
  }

  return {
    videoId,
    status:
      safeText(data?.data && (data.data as Record<string, unknown>).status) ||
      safeText(data?.status) ||
      null,
    avatarId,
    voiceId,
    raw: buildSafeHeyGenDiagnostic({
      videoId,
      status:
        safeText(data?.data && (data.data as Record<string, unknown>).status) ||
        safeText(data?.status) ||
        null,
      data,
    }),
  } satisfies HeyGenCreateResult;
}

export async function getHeyGenVideoStatus(videoId: string) {
  const normalizedVideoId = safeText(videoId);

  if (!normalizedVideoId) {
    throw new Error("Missing HeyGen video id");
  }

  let response: Response | null = null;
  let data: Record<string, unknown> | null = null;

  {
    const result = await heyGenRequest(`/v2/videos/${normalizedVideoId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    response = result.response;
    data = result.data;
  }

  if (response.status === 404) {
    const fallback = await heyGenRequest(
      `/v1/video_status.get?video_id=${encodeURIComponent(normalizedVideoId)}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );
    response = fallback.response;
    data = fallback.data;
  }

  if (!response.ok) {
    throw new Error(extractHeyGenErrorMessage(data) || "HeyGen status request failed");
  }

  const payload =
    (data?.data as Record<string, unknown> | undefined) ?? data ?? {};
  const status = normalizeHeyGenStatus(payload.status ?? payload.video_status);

  return {
    videoId: normalizedVideoId,
    status,
    videoUrl:
      safeText(payload.video_url) ||
      safeText(payload.url) ||
      safeText(
        payload.video && typeof payload.video === "object"
          ? (payload.video as Record<string, unknown>).url
          : null,
      ) ||
      null,
    thumbnailUrl:
      safeText(payload.thumbnail_url) ||
      safeText(payload.cover_url) ||
      null,
    error:
      safeText(payload.error) ||
      safeText(payload.error_message) ||
      safeText(data?.message) ||
      null,
    raw: buildSafeHeyGenDiagnostic({
      videoId: normalizedVideoId,
      status,
      data,
    }),
  } satisfies HeyGenVideoStatusResult;
}
