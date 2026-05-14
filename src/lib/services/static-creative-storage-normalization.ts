import { lookup } from "node:dns/promises";
import { stat, readFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export const STATIC_CREATIVE_STORAGE_BUCKET = "creative-assets";

export const MAX_STATIC_CREATIVE_PROVIDER_IMAGE_BYTES = 5_000_000;
export const MAX_STATIC_CREATIVE_PROVIDER_VIDEO_BYTES = 100_000_000;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_PROVIDER_REDIRECTS = 3;
const MAX_STORAGE_NORMALIZATION_ATTEMPTS = 2;
const DEFAULT_PROVIDER_IMAGE_HOSTS = [
  "platform.higgsfield.ai",
  "*.higgsfield.ai",
  "d8j0ntlcm91z4.cloudfront.net",
  "d3u0tzju9qaucj.cloudfront.net",
  "api.openai.com",
  "*.openai.com",
  "*.oaiusercontent.com",
  "*.blob.core.windows.net",
];

export type StaticCreativeStorageNormalizationResult = {
  durableUrl: string;
  storageBucket: string;
  storagePath: string | null;
  contentType: string | null;
  byteSize: number | null;
  reusedExistingAppAsset: boolean;
};

export type StaticCreativeStorageNormalizationInput = {
  supabase: SupabaseClient<Database>;
  userId: string;
  campaignId: string;
  creativeId: string;
  generationBatchId: string;
  providerUrl: string;
};

export type StaticCreativeProviderImageFetchResult = {
  bytes: Buffer;
  contentType: string;
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isAppOwnedCreativeAssetUrl(url: string) {
  const value = safeText(url);

  if (!value) {
    return false;
  }

  let parsed: URL;
  let supabaseOrigin: string;

  try {
    parsed = new URL(value);
    const supabaseUrl = getSupabaseEnv()?.url;

    if (!supabaseUrl) {
      return false;
    }

    supabaseOrigin = new URL(supabaseUrl).origin;
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" || parsed.origin !== supabaseOrigin) {
    return false;
  }

  const encodedBucket = encodeURIComponent(STATIC_CREATIVE_STORAGE_BUCKET);

  return (
    parsed.pathname.startsWith(`/storage/v1/object/public/${encodedBucket}/`) ||
    parsed.pathname.startsWith(`/storage/v1/object/sign/${encodedBucket}/`)
  );
}

function getProviderImageHostAllowlist() {
  const configured = (process.env.STATIC_CREATIVE_PROVIDER_IMAGE_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_PROVIDER_IMAGE_HOSTS;
}

function hostnameMatchesPattern(hostname: string, pattern: string) {
  const normalizedHostname = hostname.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(1);
    return normalizedHostname.endsWith(suffix) && normalizedHostname.length > suffix.length;
  }

  return normalizedHostname === normalizedPattern;
}

function isAllowedProviderImageHost(hostname: string) {
  return getProviderImageHostAllowlist().some((pattern) => hostnameMatchesPattern(hostname, pattern));
}

function isBlockedIpAddress(address: string) {
  const version = net.isIP(address);

  if (version === 0) {
    return true;
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("ff")
    );
  }

  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127 ||
    a === 192 && b === 0 ||
    a === 198 && (b === 18 || b === 19) ||
    a >= 224
  );
}

async function assertSafeProviderImageFetchUrl(url: URL) {
  if (url.protocol !== "https:") {
    throw new Error("Generated image URL must use HTTPS.");
  }

  if (!isAllowedProviderImageHost(url.hostname)) {
    throw new Error("Generated image URL host is not approved for storage.");
  }

  let addresses: Array<{ address: string }> = [];

  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: false });
  } catch {
    throw new Error("Generated image URL host could not be verified.");
  }

  if (addresses.length === 0 || addresses.some((entry) => isBlockedIpAddress(entry.address))) {
    throw new Error("Generated image URL resolved to a blocked network address.");
  }
}

export async function validateStaticCreativeProviderImageUrlForStorage(url: string) {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Generated image URL was invalid.");
  }

  await assertSafeProviderImageFetchUrl(parsed);
}

export function extensionForStaticCreativeImageContentType(contentType: string) {
  if (contentType.includes("png")) {
    return "png";
  }

  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return "jpg";
  }

  if (contentType.includes("webp")) {
    return "webp";
  }

  if (contentType.includes("gif")) {
    return "gif";
  }

  return "bin";
}

function decodeDataUri(uri: string, maxBytes = MAX_STATIC_CREATIVE_PROVIDER_IMAGE_BYTES) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/i.exec(uri);

  if (!match) {
    throw new Error("Generated image could not be read.");
  }

  const contentType = match[1].toLowerCase();

  if (!contentType.startsWith("image/")) {
    throw new Error("Generated image was not an image file.");
  }

  const bytes = match[2]
    ? Buffer.from(match[3] ?? "", "base64")
    : Buffer.from(decodeURIComponent(match[3] ?? ""), "utf8");

  if (bytes.byteLength > maxBytes) {
    throw new Error("Generated image is too large to store.");
  }

  return { bytes, contentType };
}

function isLocalGeneratedImageSource(value: string) {
  return value.startsWith("file://") || value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value);
}

function localGeneratedImageRoots() {
  return Array.from(
    new Set(
      [
        process.env.MARKETING_STUDIO_WORKER_OUTPUT_DIR,
        process.env.HIGGSFIELD_OUTPUT_DIR,
        process.env.HIGGSFIELD_CACHE_DIR,
        process.env.TMPDIR,
        os.tmpdir(),
      ]
        .map((value) => safeText(value))
        .filter(Boolean)
        .map((value) => path.resolve(value)),
    ),
  );
}

function resolveLocalGeneratedImagePath(source: string) {
  let resolved: string;

  if (source.startsWith("file://")) {
    resolved = path.resolve(new URL(source).pathname);
  } else {
    resolved = path.resolve(source);
  }

  const roots = localGeneratedImageRoots();

  if (
    roots.length === 0 ||
    !roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))
  ) {
    throw new Error("Generated image file path is outside the approved worker output directories.");
  }

  return resolved;
}

export function detectStaticCreativeImageContentType(bytes: Buffer) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (
    bytes.length >= 6 &&
    (bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
      bytes.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }

  return null;
}

export function detectGeneratedVideoContentType(bytes: Buffer) {
  if (
    bytes.length >= 12 &&
    bytes.subarray(4, 8).toString("ascii") === "ftyp"
  ) {
    const brand = bytes.subarray(8, 12).toString("ascii").toLowerCase();

    if (brand.includes("qt")) {
      return "video/quicktime";
    }

    return "video/mp4";
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }

  return null;
}

async function readLocalGeneratedImageFile(
  source: string,
  maxBytes = MAX_STATIC_CREATIVE_PROVIDER_IMAGE_BYTES,
): Promise<StaticCreativeProviderImageFetchResult> {
  const filePath = resolveLocalGeneratedImagePath(source);
  const fileStat = await stat(filePath);

  if (!fileStat.isFile()) {
    throw new Error("Generated image file path was not a file.");
  }

  if (fileStat.size <= 0 || fileStat.size > maxBytes) {
    throw new Error("Generated image file is too large to store.");
  }

  const bytes = await readFile(filePath);
  const contentType = detectStaticCreativeImageContentType(bytes);

  if (!contentType) {
    throw new Error("Generated image file was not a supported image type.");
  }

  return {
    bytes,
    contentType,
  };
}

async function readLocalGeneratedVideoFile(
  source: string,
  maxBytes = MAX_STATIC_CREATIVE_PROVIDER_VIDEO_BYTES,
): Promise<StaticCreativeProviderImageFetchResult> {
  const filePath = resolveLocalGeneratedImagePath(source);
  const fileStat = await stat(filePath);

  if (!fileStat.isFile()) {
    throw new Error("Generated video file path was not a file.");
  }

  if (fileStat.size <= 0 || fileStat.size > maxBytes) {
    throw new Error("Generated video file is too large to store.");
  }

  const bytes = await readFile(filePath);
  const contentType = detectGeneratedVideoContentType(bytes);

  if (!contentType) {
    throw new Error("Generated video file was not a supported video type.");
  }

  return {
    bytes,
    contentType,
  };
}

export async function fetchStaticCreativeProviderImage(
  url: string,
  options?: {
    maxBytes?: number;
    accept?: string;
    contentTypePrefix?: "image/" | "video/";
    errorPrefix?: string;
  },
): Promise<StaticCreativeProviderImageFetchResult> {
  const maxBytes = options?.maxBytes ?? MAX_STATIC_CREATIVE_PROVIDER_IMAGE_BYTES;
  const errorPrefix = options?.errorPrefix ?? "Generated image";
  const contentTypePrefix = options?.contentTypePrefix ?? "image/";

  if (url.startsWith("data:")) {
    if (contentTypePrefix !== "image/") {
      throw new Error(`${errorPrefix} URL was invalid.`);
    }
    return decodeDataUri(url, maxBytes);
  }

  if (isLocalGeneratedImageSource(url)) {
    if (contentTypePrefix !== "image/") {
      return readLocalGeneratedVideoFile(url, maxBytes);
    }
    return readLocalGeneratedImageFile(url, maxBytes);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${errorPrefix} URL was invalid.`);
  }

  const appOwnedCreativeAsset = isAppOwnedCreativeAssetUrl(url);

  if (!appOwnedCreativeAsset) {
    await assertSafeProviderImageFetchUrl(parsed);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let fetchUrl = parsed;
    let response: Response | null = null;

    for (let redirectCount = 0; redirectCount <= MAX_PROVIDER_REDIRECTS; redirectCount += 1) {
      if (appOwnedCreativeAsset) {
        if (!isAppOwnedCreativeAssetUrl(fetchUrl.toString())) {
          throw new Error(`${errorPrefix} app-owned storage fetch redirected outside creative-assets.`);
        }
      } else {
        await assertSafeProviderImageFetchUrl(fetchUrl);
      }

      response = await fetch(fetchUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          Accept: "image/png,image/jpeg,image/webp,image/gif",
          ...(options?.accept ? { Accept: options.accept } : {}),
        },
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        break;
      }

      const location = response.headers.get("location");

      if (!location || redirectCount === MAX_PROVIDER_REDIRECTS) {
        throw new Error(`${errorPrefix} fetch redirected too many times.`);
      }

      fetchUrl = new URL(location, fetchUrl);
    }

    if (!response) {
      throw new Error(`${errorPrefix} could not be fetched.`);
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";

    if (!response.ok || !contentType.startsWith(contentTypePrefix)) {
      throw new Error(`${errorPrefix} could not be fetched.`);
    }

    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error(`${errorPrefix} response was empty.`);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        total += value.byteLength;

        if (total > maxBytes) {
          controller.abort();
          throw new Error(`${errorPrefix} is too large.`);
        }

        chunks.push(value);
      }
    }

    return {
      bytes: Buffer.concat(chunks),
      contentType,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error("Generated image storage fetch timed out.");
      timeoutError.name = "AbortError";
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildStoragePath(params: StaticCreativeStorageNormalizationInput, extension: string) {
  const safeCreativeId = params.creativeId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120) || "creative";
  const safeBatchId = params.generationBatchId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);

  return `${params.userId}/${params.campaignId}/generated-static/${safeCreativeId}/${safeBatchId}.${extension}`;
}

export async function normalizeStaticCreativeProviderImage(
  params: StaticCreativeStorageNormalizationInput,
): Promise<StaticCreativeStorageNormalizationResult> {
  const providerUrl = safeText(params.providerUrl);

  if (!providerUrl) {
    throw new Error("Generated image URL was missing.");
  }

  if (isAppOwnedCreativeAssetUrl(providerUrl)) {
    return {
      durableUrl: providerUrl,
      storageBucket: STATIC_CREATIVE_STORAGE_BUCKET,
      storagePath: null,
      contentType: null,
      byteSize: null,
      reusedExistingAppAsset: true,
    };
  }

  let fetched: StaticCreativeProviderImageFetchResult | null = null;
  let fetchError: unknown = null;

  for (let attempt = 1; attempt <= MAX_STORAGE_NORMALIZATION_ATTEMPTS; attempt += 1) {
    try {
      fetched = await fetchStaticCreativeProviderImage(providerUrl, {
        errorPrefix: "Generated image storage",
      });
      fetchError = null;
      break;
    } catch (error) {
      fetchError = error;
    }
  }

  if (!fetched) {
    throw fetchError instanceof Error ? fetchError : new Error("Generated image could not be fetched for storage.");
  }

  const extension = extensionForStaticCreativeImageContentType(fetched.contentType);

  if (extension === "bin") {
    throw new Error("Generated image type is not supported for storage.");
  }

  const storagePath = buildStoragePath(params, extension);
  let uploadError: unknown = null;

  for (let attempt = 1; attempt <= MAX_STORAGE_NORMALIZATION_ATTEMPTS; attempt += 1) {
    const result = await params.supabase.storage
      .from(STATIC_CREATIVE_STORAGE_BUCKET)
      .upload(storagePath, fetched.bytes, {
        cacheControl: "31536000",
        contentType: fetched.contentType,
        upsert: attempt > 1,
      });

    uploadError = result.error;

    if (!uploadError) {
      break;
    }
  }

  if (uploadError) {
    throw new Error("Generated image could not be stored durably.");
  }

  const { data } = params.supabase.storage
    .from(STATIC_CREATIVE_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  if (!data.publicUrl) {
    throw new Error("Generated image storage URL could not be created.");
  }

  return {
    durableUrl: data.publicUrl,
    storageBucket: STATIC_CREATIVE_STORAGE_BUCKET,
    storagePath,
    contentType: fetched.contentType,
    byteSize: fetched.bytes.byteLength,
    reusedExistingAppAsset: false,
  };
}

function extensionForGeneratedVideoContentType(contentType: string) {
  if (contentType.includes("mp4") || contentType.includes("mpeg")) {
    return "mp4";
  }

  if (contentType.includes("webm")) {
    return "webm";
  }

  if (contentType.includes("quicktime") || contentType.includes("mov")) {
    return "mov";
  }

  return "bin";
}

function buildVideoStoragePath(params: StaticCreativeStorageNormalizationInput, extension: string) {
  const safeCreativeId = params.creativeId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120) || "creative";
  const safeBatchId = params.generationBatchId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);

  return `${params.userId}/${params.campaignId}/generated-video/${safeCreativeId}/${safeBatchId}.${extension}`;
}

export async function normalizeGeneratedVideoProviderFile(
  params: StaticCreativeStorageNormalizationInput,
): Promise<StaticCreativeStorageNormalizationResult> {
  const providerUrl = safeText(params.providerUrl);

  if (!providerUrl) {
    throw new Error("Generated video URL was missing.");
  }

  if (isAppOwnedCreativeAssetUrl(providerUrl)) {
    return {
      durableUrl: providerUrl,
      storageBucket: STATIC_CREATIVE_STORAGE_BUCKET,
      storagePath: null,
      contentType: null,
      byteSize: null,
      reusedExistingAppAsset: true,
    };
  }

  const fetched = await fetchStaticCreativeProviderImage(providerUrl, {
    maxBytes: MAX_STATIC_CREATIVE_PROVIDER_VIDEO_BYTES,
    accept: "video/mp4,video/webm,video/quicktime",
    contentTypePrefix: "video/",
    errorPrefix: "Generated video storage",
  });
  const extension = extensionForGeneratedVideoContentType(fetched.contentType);

  if (extension === "bin") {
    throw new Error("Generated video type is not supported for storage.");
  }

  const storagePath = buildVideoStoragePath(params, extension);
  const result = await params.supabase.storage
    .from(STATIC_CREATIVE_STORAGE_BUCKET)
    .upload(storagePath, fetched.bytes, {
      cacheControl: "31536000",
      contentType: fetched.contentType,
      upsert: false,
    });

  if (result.error) {
    throw new Error("Generated video could not be stored durably.");
  }

  const { data } = params.supabase.storage
    .from(STATIC_CREATIVE_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  if (!data.publicUrl) {
    throw new Error("Generated video storage URL could not be created.");
  }

  return {
    durableUrl: data.publicUrl,
    storageBucket: STATIC_CREATIVE_STORAGE_BUCKET,
    storagePath,
    contentType: fetched.contentType,
    byteSize: fetched.bytes.byteLength,
    reusedExistingAppAsset: false,
  };
}
