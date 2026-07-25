import { createHash } from "node:crypto";
import { lookup as lookupDns } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { ApiError } from "@/lib/api/route";
import {
  buildGeneratedVideoStoragePath,
  GENERATED_VIDEO_STORAGE_BUCKET,
  isCanonicalGeneratedVideoStorageIdentity,
} from "@/lib/services/creative-asset-storage-identity";
import type { Database } from "@/lib/supabase/types";
import { isPublicNetworkAddress } from "@/lib/security/public-network-address";
import {
  createPinnedDnsLookup,
  selectPreferredDnsAddress,
} from "@/lib/security/pinned-dns-lookup";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GENERATED_VIDEO_MAX_BYTES,
  isSupportedCreativeAssetMimeType,
  normalizeCreativeAssetMimeType,
  validateCreativeAssetContent,
} from "@/lib/services/creative-asset-content-validation";

const GENERATED_VIDEO_FETCH_TIMEOUT_MS = 30_000;
const GENERATED_VIDEO_MAX_REDIRECTS = 2;
const DEFAULT_PROVIDER_MEDIA_HOST_SUFFIXES: Record<VideoProviderName, readonly string[]> = {
  higgsfield: ["higgsfield.ai"],
  heygen: ["heygen.ai"],
};

type VideoProviderName = "higgsfield" | "heygen";
type GeneratedVideoStorageClient = SupabaseClient<Database>;

type StoredObject = {
  name?: unknown;
};

type GeneratedVideoMetadata = {
  dealflowKind: "generated_video";
  organizationId: string;
  userId: string;
  campaignId: string;
  providerName: VideoProviderName;
  assetId: string;
  providerAssetIdDigest: string;
  contentSha256: string;
  contentLength: number;
  mimeType: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isLoopbackHost(hostname: string) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    hostname.toLowerCase(),
  );
}

function configuredProviderMediaHosts(providerName: VideoProviderName) {
  const key = providerName === "higgsfield"
    ? "HIGGSFIELD_VIDEO_OUTPUT_HOSTS"
    : "HEYGEN_VIDEO_OUTPUT_HOSTS";
  return (process.env[key] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase().replace(/\.$/, ""))
    .filter((value) =>
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value) &&
      !isIP(value) &&
      !isLoopbackHost(value)
    );
}

function isTrustedProviderMediaHost(host: string, providerName: VideoProviderName) {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return DEFAULT_PROVIDER_MEDIA_HOST_SUFFIXES[providerName].some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  ) || configuredProviderMediaHosts(providerName).includes(normalized);
}

function normalizeCredentialFreeUrl(
  value: string,
  options: {
    allowLoopbackTestTransport: boolean;
    providerName?: VideoProviderName;
  },
) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError(502, "Generated video URL is invalid.", "generated_video_url_invalid");
  }

  const loopback = isLoopbackHost(parsed.hostname);
  if (
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (parsed.port && !(loopback && options.allowLoopbackTestTransport)) ||
    (loopback && !options.allowLoopbackTestTransport) ||
    (parsed.protocol !== "https:" && !(loopback && options.allowLoopbackTestTransport)) ||
    (
      options.providerName &&
      !loopback &&
      (Boolean(isIP(parsed.hostname)) ||
        !isTrustedProviderMediaHost(parsed.hostname, options.providerName))
    )
  ) {
    throw new ApiError(
      502,
      "Generated video URL must use credential-free HTTPS.",
      "generated_video_url_forbidden",
    );
  }

  return parsed;
}

function validateGeneratedVideoContent(bytes: Uint8Array, mimeType: string) {
  try {
    return validateCreativeAssetContent({
      bytes,
      declaredMimeType: mimeType,
      kind: "video",
      maxBytes: GENERATED_VIDEO_MAX_BYTES,
    });
  } catch (error) {
    if (
      error instanceof ApiError &&
      [
        "creative_asset_signature_invalid",
        "creative_asset_kind_mismatch",
        "creative_asset_mime_mismatch",
        "creative_asset_truncated",
      ].includes(error.code)
    ) {
      throw new ApiError(
        502,
        "Generated output did not match its declared video format.",
        "generated_video_signature_invalid",
      );
    }
    throw error;
  }
}

async function fetchBoundedLoopbackVideo(params: {
  sourceUrl: string;
  providerName: VideoProviderName;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = params.fetchImpl ?? fetch;
  const allowLoopbackTestTransport =
    process.env.NODE_ENV === "test" &&
    process.env.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT === "true";
  let currentUrl = normalizeCredentialFreeUrl(params.sourceUrl, {
    allowLoopbackTestTransport,
    providerName: params.providerName,
  });
  if (!allowLoopbackTestTransport || !isLoopbackHost(currentUrl.hostname)) {
    throw new ApiError(
      502,
      "Loopback provider media transport is available only in explicit tests.",
      "generated_video_url_forbidden",
    );
  }
  const deadline = Date.now() + GENERATED_VIDEO_FETCH_TIMEOUT_MS;

  for (let redirectCount = 0; redirectCount <= GENERATED_VIDEO_MAX_REDIRECTS; redirectCount += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new ApiError(504, "Generated video download timed out.", "generated_video_fetch_timeout");
    }

    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: { Accept: "video/mp4,video/webm,video/quicktime" },
        signal: AbortSignal.timeout(remainingMs),
      });
    } catch (error) {
      throw new ApiError(
        502,
        error instanceof Error ? error.message : "Generated video download failed.",
        "generated_video_fetch_failed",
      );
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount >= GENERATED_VIDEO_MAX_REDIRECTS) {
        throw new ApiError(
          502,
          "Generated video exceeded the redirect limit.",
          "generated_video_redirect_limit",
        );
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new ApiError(
          502,
          "Generated video redirect was missing its destination.",
          "generated_video_redirect_invalid",
        );
      }
      currentUrl = normalizeCredentialFreeUrl(new URL(location, currentUrl).toString(), {
        allowLoopbackTestTransport,
        providerName: params.providerName,
      });
      if (!isLoopbackHost(currentUrl.hostname)) {
        throw new ApiError(
          502,
          "Loopback provider tests cannot redirect to a network host.",
          "generated_video_url_forbidden",
        );
      }
      continue;
    }

    if (!response.ok) {
      throw new ApiError(
        502,
        `Generated video download failed with HTTP ${response.status}.`,
        "generated_video_fetch_failed",
      );
    }

    const mimeType = normalizeCreativeAssetMimeType(response.headers.get("content-type"));
    if (!isSupportedCreativeAssetMimeType(mimeType, "video")) {
      throw new ApiError(
        502,
        "Generated output did not have an approved video MIME type.",
        "generated_video_mime_invalid",
      );
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > GENERATED_VIDEO_MAX_BYTES) {
      throw new ApiError(
        413,
        "Generated video exceeded the 100 MiB import limit.",
        "generated_video_too_large",
      );
    }
    if (!response.body) {
      throw new ApiError(502, "Generated video response was empty.", "generated_video_empty");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        byteLength += value.byteLength;
        if (byteLength > GENERATED_VIDEO_MAX_BYTES) {
          await reader.cancel("generated video size limit exceeded").catch(() => undefined);
          throw new ApiError(
            413,
            "Generated video exceeded the 100 MiB import limit.",
            "generated_video_too_large",
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (Number.isFinite(declaredLength) && declaredLength > 0 && declaredLength !== byteLength) {
      throw new ApiError(
        502,
        "Generated video content length did not match its response.",
        "generated_video_length_mismatch",
      );
    }
    const validated = validateGeneratedVideoContent(bytes, mimeType);

    return {
      bytes: validated.bytes,
      mimeType: validated.mimeType,
      contentLength: validated.contentLength,
      contentSha256: validated.contentSha256,
    };
  }

  throw new ApiError(502, "Generated video redirect failed.", "generated_video_redirect_invalid");
}

type PinnedGeneratedVideoUrl = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export function selectPreferredGeneratedVideoAddress(
  addresses: readonly { address: string; family: number }[],
) {
  const selected = selectPreferredDnsAddress(addresses);
  if (!selected) {
    throw new ApiError(
      502,
      "Generated video host did not resolve to a supported address family.",
      "generated_video_host_forbidden",
    );
  }
  return {
    address: selected.address,
    family: selected.family,
  };
}

async function resolvePinnedGeneratedVideoUrl(
  value: string,
  providerName: VideoProviderName,
  timeoutMs: number,
): Promise<PinnedGeneratedVideoUrl> {
  const url = normalizeCredentialFreeUrl(value, {
    allowLoopbackTestTransport: false,
    providerName,
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookupDns(url.hostname, { all: true, verbatim: true }).catch(() => []),
    new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new ApiError(504, "Generated video host lookup timed out.", "generated_video_fetch_timeout")),
        timeoutMs,
      );
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
  if (
    addresses.length === 0 ||
    addresses.some((entry) => !isPublicNetworkAddress(entry.address))
  ) {
    throw new ApiError(
      502,
      "Generated video host could not be verified as public.",
      "generated_video_host_forbidden",
    );
  }
  // Some provider CDNs return IPv6 records first even in runtimes without a
  // usable IPv6 route. Prefer a verified-public IPv4 address when available,
  // while retaining IPv6 as the fail-closed fallback for IPv6-only hosts.
  const selected = selectPreferredGeneratedVideoAddress(addresses);
  return {
    url,
    address: selected.address,
    family: selected.family,
  };
}

function consumePinnedGeneratedVideo(
  response: IncomingMessage,
  request: ReturnType<typeof httpsRequest>,
) {
  return new Promise<{
    bytes: Uint8Array;
    mimeType: string;
    contentLength: number;
    contentSha256: string;
  }>((resolve, reject) => {
    const mimeType = normalizeCreativeAssetMimeType(String(response.headers["content-type"] ?? ""));
    const declaredLength = Number(response.headers["content-length"] ?? "");
    if (!isSupportedCreativeAssetMimeType(mimeType, "video")) {
      response.resume();
      reject(new ApiError(502, "Generated output did not have an approved video MIME type.", "generated_video_mime_invalid"));
      return;
    }
    if (Number.isFinite(declaredLength) && declaredLength > GENERATED_VIDEO_MAX_BYTES) {
      response.resume();
      reject(new ApiError(413, "Generated video exceeded the 100 MiB import limit.", "generated_video_too_large"));
      return;
    }

    const chunks: Buffer[] = [];
    let byteLength = 0;
    response.on("data", (chunk: Buffer) => {
      byteLength += chunk.byteLength;
      if (byteLength > GENERATED_VIDEO_MAX_BYTES) {
        request.destroy(new Error("generated_video_too_large"));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    response.once("error", (error) => reject(
      new ApiError(
        error.message === "generated_video_too_large" ? 413 : 502,
        error.message === "generated_video_too_large"
          ? "Generated video exceeded the 100 MiB import limit."
          : "Generated video download failed.",
        error.message === "generated_video_too_large"
          ? "generated_video_too_large"
          : "generated_video_fetch_failed",
      ),
    ));
    response.once("end", () => {
      if (byteLength === 0) {
        reject(new ApiError(502, "Generated video response was empty.", "generated_video_empty"));
        return;
      }
      if (Number.isFinite(declaredLength) && declaredLength > 0 && declaredLength !== byteLength) {
        reject(new ApiError(502, "Generated video content length did not match its response.", "generated_video_length_mismatch"));
        return;
      }
      const bytes = new Uint8Array(Buffer.concat(chunks, byteLength));
      try {
        const validated = validateGeneratedVideoContent(bytes, mimeType);
        resolve({
          bytes: validated.bytes,
          mimeType: validated.mimeType,
          contentLength: validated.contentLength,
          contentSha256: validated.contentSha256,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function requestPinnedGeneratedVideo(
  resolved: PinnedGeneratedVideoUrl,
  timeoutMs: number,
) {
  return new Promise<{
    redirect?: string;
    media?: Awaited<ReturnType<typeof consumePinnedGeneratedVideo>>;
  }>((resolve, reject) => {
    const request = httpsRequest(resolved.url, {
      method: "GET",
      headers: {
        Accept: "video/mp4,video/webm,video/quicktime",
        "Accept-Encoding": "identity",
        "User-Agent": "DealFlow-Generated-Video-Import/1",
      },
      lookup: createPinnedDnsLookup(resolved),
      timeout: timeoutMs,
    }, async (response) => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.resume();
        resolve({
          redirect: location ? new URL(location, resolved.url).toString() : "",
        });
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new ApiError(502, `Generated video download failed with HTTP ${status}.`, "generated_video_fetch_failed"));
        return;
      }
      try {
        resolve({ media: await consumePinnedGeneratedVideo(response, request) });
      } catch (error) {
        reject(error);
      }
    });
    request.once("timeout", () => request.destroy(new Error("generated_video_fetch_timeout")));
    request.once("error", (error) => reject(new ApiError(
      error.message === "generated_video_fetch_timeout" ? 504 :
        error.message === "generated_video_too_large" ? 413 : 502,
      error.message === "generated_video_fetch_timeout"
        ? "Generated video download timed out."
        : error.message === "generated_video_too_large"
          ? "Generated video exceeded the 100 MiB import limit."
          : "Generated video download failed.",
      error.message === "generated_video_fetch_timeout"
        ? "generated_video_fetch_timeout"
        : error.message === "generated_video_too_large"
          ? "generated_video_too_large"
          : "generated_video_fetch_failed",
    )));
    const hardTimeout = setTimeout(
      () => request.destroy(new Error("generated_video_fetch_timeout")),
      timeoutMs,
    );
    request.once("close", () => clearTimeout(hardTimeout));
    request.end();
  });
}

async function fetchBoundedGeneratedVideo(params: {
  sourceUrl: string;
  providerName: VideoProviderName;
  fetchImpl?: typeof fetch;
}) {
  let initial: URL;
  try {
    initial = new URL(params.sourceUrl);
  } catch {
    throw new ApiError(502, "Generated video URL is invalid.", "generated_video_url_invalid");
  }
  const allowLoopbackTestTransport =
    process.env.NODE_ENV === "test" &&
    process.env.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT === "true";
  if (isLoopbackHost(initial.hostname) && allowLoopbackTestTransport) {
    return fetchBoundedLoopbackVideo(params);
  }

  const deadline = Date.now() + GENERATED_VIDEO_FETCH_TIMEOUT_MS;
  let resolved = await resolvePinnedGeneratedVideoUrl(
    params.sourceUrl,
    params.providerName,
    GENERATED_VIDEO_FETCH_TIMEOUT_MS,
  );
  for (let redirectCount = 0; redirectCount <= GENERATED_VIDEO_MAX_REDIRECTS; redirectCount += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new ApiError(504, "Generated video download timed out.", "generated_video_fetch_timeout");
    }
    const result = await requestPinnedGeneratedVideo(resolved, remainingMs);
    if (result.media) return result.media;
    if (!result.redirect || redirectCount === GENERATED_VIDEO_MAX_REDIRECTS) {
      throw new ApiError(502, "Generated video redirect could not be verified.", "generated_video_redirect_limit");
    }
    const redirectRemainingMs = deadline - Date.now();
    if (redirectRemainingMs <= 0) {
      throw new ApiError(504, "Generated video download timed out.", "generated_video_fetch_timeout");
    }
    resolved = await resolvePinnedGeneratedVideoUrl(
      result.redirect,
      params.providerName,
      redirectRemainingMs,
    );
  }
  throw new ApiError(502, "Generated video redirect failed.", "generated_video_redirect_invalid");
}

function providerAssetIdDigest(providerName: VideoProviderName, providerAssetId: string) {
  return createHash("sha256")
    .update(`${providerName}:${providerAssetId}`)
    .digest("hex");
}

function expectedIdentityMetadata(params: {
  organizationId: string;
  userId: string;
  campaignId: string;
  providerName: VideoProviderName;
  assetId: string;
  providerAssetId: string;
}) {
  return {
    dealflowKind: "generated_video",
    organizationId: params.organizationId,
    userId: params.userId,
    campaignId: params.campaignId,
    providerName: params.providerName,
    assetId: params.assetId,
    providerAssetIdDigest: providerAssetIdDigest(
      params.providerName,
      params.providerAssetId,
    ),
  } as const;
}

function parseExistingMetadata(value: unknown): GeneratedVideoMetadata | null {
  const outer = asRecord(value);
  // Supabase Storage versions have represented upload metadata directly and
  // under `metadata` or `customMetadata`. Accept only one complete exact shape;
  // transport metadata alone can never prove a DealFlow identity.
  const parsed: GeneratedVideoMetadata[] = [];
  for (const metadata of [
    asRecord(outer.customMetadata),
    asRecord(outer.custom_metadata),
    asRecord(outer.metadata),
    outer,
  ]) {
    const contentLength = Number(metadata.contentLength);
    if (
      metadata.dealflowKind === "generated_video" &&
      typeof metadata.organizationId === "string" &&
      typeof metadata.userId === "string" &&
      typeof metadata.campaignId === "string" &&
      (metadata.providerName === "higgsfield" || metadata.providerName === "heygen") &&
      typeof metadata.assetId === "string" &&
      typeof metadata.providerAssetIdDigest === "string" &&
      typeof metadata.contentSha256 === "string" &&
      /^[0-9a-f]{64}$/.test(metadata.contentSha256) &&
      Number.isSafeInteger(contentLength) &&
      contentLength > 0 &&
      contentLength <= GENERATED_VIDEO_MAX_BYTES &&
      typeof metadata.mimeType === "string" &&
      isSupportedCreativeAssetMimeType(metadata.mimeType, "video")
    ) {
      parsed.push({
        dealflowKind: "generated_video",
        organizationId: metadata.organizationId,
        userId: metadata.userId,
        campaignId: metadata.campaignId,
        providerName: metadata.providerName,
        assetId: metadata.assetId,
        providerAssetIdDigest: metadata.providerAssetIdDigest,
        contentSha256: metadata.contentSha256,
        contentLength,
        mimeType: metadata.mimeType,
      });
    }
  }
  if (parsed.length === 0) return null;
  const canonical = JSON.stringify(parsed[0]);
  return parsed.every((candidate) => JSON.stringify(candidate) === canonical)
    ? parsed[0]!
    : null;
}

function metadataMatchesIdentity(
  metadata: GeneratedVideoMetadata | null,
  expected: ReturnType<typeof expectedIdentityMetadata>,
) {
  return Boolean(
    metadata &&
    metadata.dealflowKind === expected.dealflowKind &&
    metadata.organizationId === expected.organizationId &&
    metadata.userId === expected.userId &&
    metadata.campaignId === expected.campaignId &&
    metadata.providerName === expected.providerName &&
    metadata.assetId === expected.assetId &&
    metadata.providerAssetIdDigest === expected.providerAssetIdDigest,
  );
}

async function findExistingObject(params: {
  client: GeneratedVideoStorageClient;
  storagePath: string;
  expected: ReturnType<typeof expectedIdentityMetadata>;
}) {
  const pathSegments = params.storagePath.split("/");
  const fileName = pathSegments.pop() ?? "";
  const folder = pathSegments.join("/");
  const { data, error } = await params.client.storage
    .from(GENERATED_VIDEO_STORAGE_BUCKET)
    .list(folder, { limit: 2, search: fileName });
  if (error) {
    throw new ApiError(
      503,
      error.message ?? "Generated video object lookup failed.",
      "generated_video_storage_lookup_failed",
    );
  }
  const matches = (Array.isArray(data) ? data : [])
    .filter((item: StoredObject) => item.name === fileName);
  if (matches.length > 1) {
    throw new ApiError(
      409,
      "Generated video storage identity is ambiguous.",
      "generated_video_storage_collision",
    );
  }
  if (matches.length === 0) return null;

  // `list()` is only the exact-path existence check. Supabase's list payload
  // exposes transport metadata and its custom metadata representation has
  // varied across Storage API versions. The typed object-info endpoint is the
  // authoritative source for the service-authored immutable identity.
  const { data: objectInfo, error: infoError } = await params.client.storage
    .from(GENERATED_VIDEO_STORAGE_BUCKET)
    .info(params.storagePath);
  if (infoError || !objectInfo) {
    throw new ApiError(
      503,
      infoError?.message ?? "Generated video object identity lookup failed.",
      "generated_video_storage_identity_lookup_failed",
    );
  }
  if (
    (typeof objectInfo.bucketId === "string" &&
      objectInfo.bucketId !== GENERATED_VIDEO_STORAGE_BUCKET) ||
    (typeof objectInfo.name === "string" && objectInfo.name !== params.storagePath)
  ) {
    throw new ApiError(
      409,
      "The generated-video object-info response did not match its canonical path.",
      "generated_video_storage_collision",
    );
  }
  const metadata = parseExistingMetadata(objectInfo.metadata);
  if (!metadataMatchesIdentity(metadata, params.expected)) {
    throw new ApiError(
      409,
      "The canonical generated-video path is occupied by another identity.",
      "generated_video_storage_collision",
    );
  }
  return metadata;
}

function getCanonicalPublicUrl(client: GeneratedVideoStorageClient, storagePath: string) {
  const { data } = client.storage
    .from(GENERATED_VIDEO_STORAGE_BUCKET)
    .getPublicUrl(storagePath);
  const publicUrl = data?.publicUrl;
  if (typeof publicUrl !== "string") {
    throw new ApiError(
      503,
      "Generated video public URL could not be derived.",
      "generated_video_public_url_invalid",
    );
  }
  const normalized = normalizeCredentialFreeUrl(publicUrl, {
    allowLoopbackTestTransport:
      process.env.NODE_ENV === "test" &&
      process.env.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT === "true",
  });
  if (process.env.NODE_ENV !== "test") {
    let configuredOrigin = "";
    try {
      configuredOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
    } catch {
      // Fail below: a customer URL must remain bound to the configured store.
    }
    if (!configuredOrigin || normalized.origin !== configuredOrigin) {
      throw new ApiError(
        503,
        "Generated video public URL did not match the configured object store.",
        "generated_video_public_url_invalid",
      );
    }
  }
  return normalized.toString();
}

export async function importGeneratedVideoToCanonicalStorage(params: {
  client: GeneratedVideoStorageClient;
  organizationId: string;
  userId: string;
  campaignId: string;
  providerName: VideoProviderName;
  providerAssetId: string;
  assetId: string;
  sourceUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const storagePath = buildGeneratedVideoStoragePath(params);
  const expected = expectedIdentityMetadata(params);
  let existingMetadata = await findExistingObject({
    client: params.client,
    storagePath,
    expected,
  });
  let uploaded = false;

  if (!existingMetadata) {
    const downloaded = await fetchBoundedGeneratedVideo({
      sourceUrl: params.sourceUrl,
      providerName: params.providerName,
      fetchImpl: params.fetchImpl,
    });
    const uploadMetadata: GeneratedVideoMetadata = {
      ...expected,
      contentSha256: downloaded.contentSha256,
      contentLength: downloaded.contentLength,
      mimeType: downloaded.mimeType,
    };
    const { error: uploadError } = await params.client.storage
      .from(GENERATED_VIDEO_STORAGE_BUCKET)
      .upload(storagePath, downloaded.bytes, {
        cacheControl: "31536000",
        contentType: downloaded.mimeType,
        metadata: uploadMetadata,
        upsert: false,
      });
    if (uploadError) {
      // A concurrent/replayed worker may have won the immutable create. Re-read
      // and accept only the exact service-authored identity; never overwrite.
      existingMetadata = await findExistingObject({
        client: params.client,
        storagePath,
        expected,
      });
      if (!existingMetadata) {
        throw new ApiError(
          503,
          uploadError.message ?? "Generated video upload outcome is ambiguous.",
          "generated_video_storage_upload_ambiguous",
        );
      }
    } else {
      uploaded = true;
      existingMetadata = uploadMetadata;
    }
  }

  let publicUrl: string;
  try {
    publicUrl = getCanonicalPublicUrl(params.client, storagePath);
  } catch (error) {
    if (uploaded) {
      // No database bind was attempted, so removing only the exact object
      // created by this execution is safe. A cleanup failure is surfaced.
      const { error: cleanupError } = await params.client.storage
        .from(GENERATED_VIDEO_STORAGE_BUCKET)
        .remove([storagePath]);
      if (cleanupError) {
        throw new ApiError(
          503,
          "Generated video import failed and its unbound object requires operator cleanup.",
          "generated_video_storage_cleanup_failed",
        );
      }
    }
    throw error;
  }

  const { data: bindingRows, error: bindingError } = await (params.client as any).rpc(
    "bind_generated_video_storage_v1",
    {
      p_asset_id: params.assetId,
      p_organization_id: params.organizationId,
      p_user_id: params.userId,
      p_campaign_id: params.campaignId,
      p_provider_name: params.providerName,
      p_provider_asset_id: params.providerAssetId,
      p_storage_bucket: GENERATED_VIDEO_STORAGE_BUCKET,
      p_storage_path: storagePath,
      p_file_url: publicUrl,
      p_content_sha256: existingMetadata.contentSha256,
      p_content_length: existingMetadata.contentLength,
      p_mime_type: existingMetadata.mimeType,
    },
  );
  if (bindingError) {
    // Never remove after the binding RPC was attempted: the response can be
    // ambiguous and deleting could break a committed canonical identity.
    throw new ApiError(
      503,
      bindingError.message ?? "Generated video storage binding outcome is ambiguous.",
      "generated_video_storage_bind_ambiguous",
    );
  }
  const binding = Array.isArray(bindingRows) ? bindingRows[0] : bindingRows;
  if (
    !binding ||
    binding.bound !== true ||
    !isCanonicalGeneratedVideoStorageIdentity({
      organizationId: params.organizationId,
      userId: params.userId,
      campaignId: params.campaignId,
      providerName: params.providerName,
      assetId: params.assetId,
      storageBucket: binding.storage_bucket,
      storagePath: binding.storage_path,
    }) ||
    binding.file_url !== publicUrl
  ) {
    throw new ApiError(
      503,
      "Generated video storage binding returned an invalid receipt.",
      "generated_video_storage_bind_ambiguous",
    );
  }

  return {
    storageBucket: GENERATED_VIDEO_STORAGE_BUCKET,
    storagePath,
    publicUrl,
    contentSha256: existingMetadata.contentSha256,
    contentLength: existingMetadata.contentLength,
    mimeType: existingMetadata.mimeType,
    reusedExistingObject: !uploaded,
    reusedExistingBinding: binding.reused === true,
  };
}
