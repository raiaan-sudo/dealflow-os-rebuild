import { createHash } from "node:crypto";
import { lookup as lookupDns } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { ApiError } from "@/lib/api/route";
import {
  GENERATED_IMAGE_MAX_BYTES,
  isSupportedCreativeAssetMimeType,
  normalizeCreativeAssetMimeType,
  validateCreativeAssetContent,
} from "@/lib/services/creative-asset-content-validation";
import {
  buildGeneratedStaticStoragePath,
  GENERATED_STATIC_STORAGE_BUCKET,
} from "@/lib/services/creative-asset-storage-identity";
import { isPublicNetworkAddress } from "@/lib/security/public-network-address";
import {
  createPinnedDnsLookup,
  selectPreferredDnsAddress,
} from "@/lib/security/pinned-dns-lookup";

const GENERATED_STATIC_FETCH_TIMEOUT_MS = 30_000;
const GENERATED_STATIC_MAX_REDIRECTS = 2;
const DEFAULT_OPENAI_IMAGE_HOSTS = [
  "openai.com",
  "oaiusercontent.com",
  "oaidalleapiprodscus.blob.core.windows.net",
  "oaidalleapiprodweu.blob.core.windows.net",
  "openai-labs-public-images-prod.azureedge.net",
] as const;

type StorageClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string | null } | null }>;
  storage: {
    from: (bucket: string) => {
      list: (folder: string, options: { search: string; limit: number }) => Promise<{
        data: Array<{ name?: unknown }> | null;
        error: { message?: string } | null;
      }>;
      info: (path: string) => Promise<{ data: unknown; error: { message?: string } | null }>;
      upload: (
        path: string,
        bytes: Uint8Array,
        options: {
          upsert: false;
          contentType: string;
          cacheControl: string;
          metadata: Record<string, unknown>;
        },
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl?: string } };
    };
  };
};

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

async function authorizeGeneratedStaticUpload(params: StaticIdentity & {
  client: StorageClient;
  storageBucket: string;
  storagePath: string;
  contentSha256: string;
  contentLength: number;
  mimeType: string;
}) {
  const { data, error } = await params.client.rpc(
    "authorize_generated_static_storage_upload_v1",
    {
      p_dispatch_id: params.dispatchId,
      p_organization_id: params.organizationId,
      p_user_id: params.userId,
      p_campaign_id: params.campaignId,
      p_storage_bucket: params.storageBucket,
      p_storage_path: params.storagePath,
      p_content_sha256: params.contentSha256,
      p_content_length: params.contentLength,
      p_mime_type: params.mimeType,
    },
  );
  const receipt = firstRow(data) as Record<string, unknown> | null;
  if (error || !receipt || receipt.authorized !== true) {
    throw new ApiError(
      502,
      error?.message ?? "Generated image storage authority was not granted.",
      "generated_static_storage_authority_failed",
    );
  }
}

type StaticIdentity = {
  organizationId: string;
  userId: string;
  campaignId: string;
  providerName: "openai";
  dispatchId: string;
};

type StoredMetadata = StaticIdentity & {
  dealflowKind: "generated_static";
  dispatchIdDigest: string;
  contentSha256: string;
  contentLength: number;
  mimeType: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isLoopbackHost(value: string) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(value.toLowerCase());
}

function configuredOpenAiImageHosts() {
  return (process.env.OPENAI_IMAGE_OUTPUT_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase().replace(/\.$/, ""))
    .filter((value) =>
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value) &&
      !isIP(value) &&
      !isLoopbackHost(value)
    );
}

function isTrustedOpenAiImageHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return DEFAULT_OPENAI_IMAGE_HOSTS.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  ) || configuredOpenAiImageHosts().includes(normalized);
}

function normalizeProviderUrl(value: string, allowLoopback: boolean) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError(502, "Generated image URL is invalid.", "generated_static_url_invalid");
  }
  const loopback = isLoopbackHost(parsed.hostname);
  if (
    parsed.username || parsed.password || parsed.hash ||
    (parsed.port && !(loopback && allowLoopback)) ||
    (parsed.protocol !== "https:" && !(loopback && allowLoopback)) ||
    (loopback ? !allowLoopback : Boolean(isIP(parsed.hostname)) || !isTrustedOpenAiImageHost(parsed.hostname))
  ) {
    throw new ApiError(
      502,
      "Generated image URL is not an approved credential-free HTTPS source.",
      "generated_static_url_forbidden",
    );
  }
  return parsed;
}

function decodeDataUrl(value: string) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value.trim());
  if (!match || match[2]!.length === 0 || match[2]!.length > GENERATED_IMAGE_MAX_BYTES * 2) {
    throw new ApiError(502, "Generated image data URL is invalid.", "generated_static_data_url_invalid");
  }
  const encoded = match[2]!;
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const bytes = new Uint8Array(Buffer.from(padded, "base64"));
  if (Buffer.from(bytes).toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw new ApiError(502, "Generated image data URL is invalid.", "generated_static_data_url_invalid");
  }
  return validateCreativeAssetContent({
    bytes,
    declaredMimeType: match[1],
    kind: "image",
    maxBytes: GENERATED_IMAGE_MAX_BYTES,
  });
}

async function readResponseBytes(response: Response) {
  const declaredMimeType = normalizeCreativeAssetMimeType(response.headers.get("content-type"));
  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > GENERATED_IMAGE_MAX_BYTES) {
    throw new ApiError(413, "Generated image exceeded its import limit.", "generated_static_too_large");
  }
  if (!response.body) {
    throw new ApiError(502, "Generated image response was empty.", "generated_static_empty");
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      length += value.byteLength;
      if (length > GENERATED_IMAGE_MAX_BYTES) {
        await reader.cancel("generated image size limit exceeded").catch(() => undefined);
        throw new ApiError(413, "Generated image exceeded its import limit.", "generated_static_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (Number.isFinite(declaredLength) && declaredLength > 0 && declaredLength !== length) {
    throw new ApiError(502, "Generated image content length did not match.", "generated_static_length_mismatch");
  }
  return validateCreativeAssetContent({
    bytes,
    declaredMimeType,
    kind: "image",
    maxBytes: GENERATED_IMAGE_MAX_BYTES,
  });
}

async function fetchWithInjectedTransport(sourceUrl: string, fetchImpl: typeof fetch) {
  const allowLoopback = process.env.NODE_ENV === "test" &&
    process.env.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT === "true";
  let current = normalizeProviderUrl(sourceUrl, allowLoopback);
  for (let redirects = 0; redirects <= GENERATED_STATIC_MAX_REDIRECTS; redirects += 1) {
    const response = await fetchImpl(current, {
      redirect: "manual",
      headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" },
      signal: AbortSignal.timeout(GENERATED_STATIC_FETCH_TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === GENERATED_STATIC_MAX_REDIRECTS) {
        throw new ApiError(502, "Generated image exceeded the redirect limit.", "generated_static_redirect_limit");
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new ApiError(502, "Generated image redirect was invalid.", "generated_static_redirect_invalid");
      }
      current = normalizeProviderUrl(new URL(location, current).toString(), allowLoopback);
      continue;
    }
    if (!response.ok) {
      throw new ApiError(502, `Generated image download failed with HTTP ${response.status}.`, "generated_static_fetch_failed");
    }
    return readResponseBytes(response);
  }
  throw new ApiError(502, "Generated image redirect failed.", "generated_static_redirect_invalid");
}

async function resolvePinnedUrl(value: string, timeoutMs: number) {
  const url = normalizeProviderUrl(value, false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookupDns(url.hostname, { all: true, verbatim: true }).catch(() => []),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new ApiError(504, "Generated image host lookup timed out.", "generated_static_fetch_timeout")),
        timeoutMs,
      );
    }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
  if (addresses.length === 0 || addresses.some((entry) => !isPublicNetworkAddress(entry.address))) {
    throw new ApiError(502, "Generated image host could not be verified as public.", "generated_static_host_forbidden");
  }
  const selected = selectPreferredDnsAddress(addresses);
  if (!selected) {
    throw new ApiError(502, "Generated image host did not resolve to a supported address family.", "generated_static_host_forbidden");
  }
  return { url, ...selected };
}

function consumePinnedResponse(response: IncomingMessage, request: ReturnType<typeof httpsRequest>) {
  return new Promise<Awaited<ReturnType<typeof validateCreativeAssetContent>>>((resolve, reject) => {
    const declaredMimeType = normalizeCreativeAssetMimeType(String(response.headers["content-type"] ?? ""));
    const declaredLength = Number(response.headers["content-length"] ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > GENERATED_IMAGE_MAX_BYTES) {
      response.resume();
      reject(new ApiError(413, "Generated image exceeded its import limit.", "generated_static_too_large"));
      return;
    }
    const chunks: Buffer[] = [];
    let length = 0;
    response.on("data", (chunk: Buffer) => {
      length += chunk.byteLength;
      if (length > GENERATED_IMAGE_MAX_BYTES) {
        request.destroy(new Error("generated_static_too_large"));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    response.once("error", (error) => reject(new ApiError(
      error.message === "generated_static_too_large" ? 413 : 502,
      error.message === "generated_static_too_large" ? "Generated image exceeded its import limit." : "Generated image download failed.",
      error.message === "generated_static_too_large" ? "generated_static_too_large" : "generated_static_fetch_failed",
    )));
    response.once("end", () => {
      if (Number.isFinite(declaredLength) && declaredLength > 0 && declaredLength !== length) {
        reject(new ApiError(502, "Generated image content length did not match.", "generated_static_length_mismatch"));
        return;
      }
      try {
        resolve(validateCreativeAssetContent({
          bytes: new Uint8Array(Buffer.concat(chunks, length)),
          declaredMimeType,
          kind: "image",
          maxBytes: GENERATED_IMAGE_MAX_BYTES,
        }));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function requestPinnedUrl(resolved: Awaited<ReturnType<typeof resolvePinnedUrl>>, timeoutMs: number) {
  return new Promise<{
    redirect?: string;
    media?: ReturnType<typeof validateCreativeAssetContent>;
  }>((resolve, reject) => {
    const request = httpsRequest(resolved.url, {
      method: "GET",
      headers: {
        Accept: "image/png,image/jpeg,image/webp,image/gif",
        "Accept-Encoding": "identity",
        "User-Agent": "DealFlow-Generated-Static-Import/1",
      },
      lookup: createPinnedDnsLookup(resolved),
      timeout: timeoutMs,
    }, async (response) => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.resume();
        resolve({ redirect: location ? new URL(location, resolved.url).toString() : "" });
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new ApiError(502, `Generated image download failed with HTTP ${status}.`, "generated_static_fetch_failed"));
        return;
      }
      try {
        resolve({ media: await consumePinnedResponse(response, request) });
      } catch (error) {
        reject(error);
      }
    });
    request.once("timeout", () => request.destroy(new Error("generated_static_fetch_timeout")));
    request.once("error", (error) => reject(new ApiError(
      error.message === "generated_static_fetch_timeout" ? 504 : error.message === "generated_static_too_large" ? 413 : 502,
      error.message === "generated_static_fetch_timeout" ? "Generated image download timed out." :
        error.message === "generated_static_too_large" ? "Generated image exceeded its import limit." : "Generated image download failed.",
      error.message === "generated_static_fetch_timeout" ? "generated_static_fetch_timeout" :
        error.message === "generated_static_too_large" ? "generated_static_too_large" : "generated_static_fetch_failed",
    )));
    request.end();
  });
}

async function fetchGeneratedImage(sourceUrl: string, fetchImpl?: typeof fetch) {
  if (sourceUrl.startsWith("data:")) return decodeDataUrl(sourceUrl);
  if (fetchImpl) return fetchWithInjectedTransport(sourceUrl, fetchImpl);
  const deadline = Date.now() + GENERATED_STATIC_FETCH_TIMEOUT_MS;
  let resolved = await resolvePinnedUrl(sourceUrl, GENERATED_STATIC_FETCH_TIMEOUT_MS);
  for (let redirects = 0; redirects <= GENERATED_STATIC_MAX_REDIRECTS; redirects += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new ApiError(504, "Generated image download timed out.", "generated_static_fetch_timeout");
    }
    const result = await requestPinnedUrl(resolved, remainingMs);
    if (result.media) return result.media;
    if (!result.redirect || redirects === GENERATED_STATIC_MAX_REDIRECTS) {
      throw new ApiError(502, "Generated image redirect could not be verified.", "generated_static_redirect_limit");
    }
    resolved = await resolvePinnedUrl(result.redirect, Math.max(deadline - Date.now(), 1));
  }
  throw new ApiError(502, "Generated image redirect failed.", "generated_static_redirect_invalid");
}

function dispatchDigest(dispatchId: string) {
  return createHash("sha256").update(`openai:${dispatchId}`).digest("hex");
}

function parseStoredMetadata(value: unknown): StoredMetadata | null {
  const outer = asRecord(value);
  const candidates = [asRecord(outer.customMetadata), asRecord(outer.custom_metadata), asRecord(outer.metadata), outer];
  for (const metadata of candidates) {
    const contentLength = Number(metadata.contentLength);
    if (
      metadata.dealflowKind === "generated_static" &&
      typeof metadata.organizationId === "string" &&
      typeof metadata.userId === "string" &&
      typeof metadata.campaignId === "string" &&
      metadata.providerName === "openai" &&
      typeof metadata.dispatchId === "string" &&
      typeof metadata.dispatchIdDigest === "string" && /^[0-9a-f]{64}$/.test(metadata.dispatchIdDigest) &&
      typeof metadata.contentSha256 === "string" && /^[0-9a-f]{64}$/.test(metadata.contentSha256) &&
      Number.isSafeInteger(contentLength) && contentLength > 0 && contentLength <= GENERATED_IMAGE_MAX_BYTES &&
      typeof metadata.mimeType === "string" &&
      isSupportedCreativeAssetMimeType(metadata.mimeType, "image")
    ) {
      return {
        dealflowKind: "generated_static",
        organizationId: metadata.organizationId,
        userId: metadata.userId,
        campaignId: metadata.campaignId,
        providerName: "openai",
        dispatchId: metadata.dispatchId,
        dispatchIdDigest: metadata.dispatchIdDigest,
        contentSha256: metadata.contentSha256,
        contentLength,
        mimeType: metadata.mimeType,
      };
    }
  }
  return null;
}

function metadataMatches(metadata: StoredMetadata | null, identity: StaticIdentity) {
  return Boolean(metadata &&
    metadata.organizationId === identity.organizationId &&
    metadata.userId === identity.userId &&
    metadata.campaignId === identity.campaignId &&
    metadata.providerName === identity.providerName &&
    metadata.dispatchId === identity.dispatchId &&
    metadata.dispatchIdDigest === dispatchDigest(identity.dispatchId));
}

export async function importGeneratedStaticToCanonicalStorage(params: StaticIdentity & {
  client: StorageClient;
  sourceUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const storagePath = buildGeneratedStaticStoragePath(params);
  const bucket = params.client.storage.from(GENERATED_STATIC_STORAGE_BUCKET);
  const segments = storagePath.split("/");
  const name = segments.pop()!;
  const folder = segments.join("/");
  const listed = await bucket.list(folder, { search: name, limit: 2 });
  if (listed.error) {
    throw new ApiError(502, listed.error.message ?? "Generated image storage lookup failed.", "generated_static_storage_lookup_failed");
  }
  const matches = (listed.data ?? []).filter((entry) => entry.name === name);
  if (matches.length > 0) {
    const info = await bucket.info(storagePath);
    const metadata = parseStoredMetadata(info.data);
    if (info.error || !metadataMatches(metadata, params)) {
      throw new ApiError(409, "Generated image storage path is occupied by another identity.", "generated_static_storage_collision");
    }
    const publicUrl = bucket.getPublicUrl(storagePath).data.publicUrl;
    if (!publicUrl) throw new ApiError(500, "Generated image public URL is unavailable.", "generated_static_public_url_missing");
    return {
      storageBucket: GENERATED_STATIC_STORAGE_BUCKET,
      storagePath,
      publicUrl,
      contentSha256: metadata!.contentSha256,
      contentLength: metadata!.contentLength,
      mimeType: metadata!.mimeType,
      reusedExistingObject: true,
    };
  }

  const content = await fetchGeneratedImage(params.sourceUrl, params.fetchImpl);
  await authorizeGeneratedStaticUpload({
    ...params,
    storageBucket: GENERATED_STATIC_STORAGE_BUCKET,
    storagePath,
    contentSha256: content.contentSha256,
    contentLength: content.contentLength,
    mimeType: content.mimeType,
  });
  const metadata: StoredMetadata = {
    dealflowKind: "generated_static",
    organizationId: params.organizationId,
    userId: params.userId,
    campaignId: params.campaignId,
    providerName: "openai",
    dispatchId: params.dispatchId,
    dispatchIdDigest: dispatchDigest(params.dispatchId),
    contentSha256: content.contentSha256,
    contentLength: content.contentLength,
    mimeType: content.mimeType,
  };
  const uploaded = await bucket.upload(storagePath, content.bytes, {
    upsert: false,
    contentType: content.mimeType,
    cacheControl: "31536000",
    metadata,
  });
  if (uploaded.error) {
    throw new ApiError(502, uploaded.error.message ?? "Generated image could not be stored.", "generated_static_storage_upload_failed");
  }
  const publicUrl = bucket.getPublicUrl(storagePath).data.publicUrl;
  if (!publicUrl) throw new ApiError(500, "Generated image public URL is unavailable.", "generated_static_public_url_missing");
  return {
    storageBucket: GENERATED_STATIC_STORAGE_BUCKET,
    storagePath,
    publicUrl,
    contentSha256: content.contentSha256,
    contentLength: content.contentLength,
    mimeType: content.mimeType,
    reusedExistingObject: false,
  };
}
