import { lookup } from "node:dns/promises";
import net from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export const STATIC_CREATIVE_STORAGE_BUCKET = "creative-assets";

const MAX_PROVIDER_IMAGE_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_PROVIDER_REDIRECTS = 3;
const DEFAULT_PROVIDER_IMAGE_HOSTS = [
  "platform.higgsfield.ai",
  "*.higgsfield.ai",
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

function extensionForContentType(contentType: string) {
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

function decodeDataUri(uri: string) {
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

  if (bytes.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new Error("Generated image is too large to store.");
  }

  return { bytes, contentType };
}

async function fetchProviderImage(url: string) {
  if (url.startsWith("data:")) {
    return decodeDataUri(url);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Generated image URL was invalid.");
  }

  await assertSafeProviderImageFetchUrl(parsed);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let fetchUrl = parsed;
    let response: Response | null = null;

    for (let redirectCount = 0; redirectCount <= MAX_PROVIDER_REDIRECTS; redirectCount += 1) {
      await assertSafeProviderImageFetchUrl(fetchUrl);
      response = await fetch(fetchUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          Accept: "image/png,image/jpeg,image/webp,image/gif",
        },
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        break;
      }

      const location = response.headers.get("location");

      if (!location || redirectCount === MAX_PROVIDER_REDIRECTS) {
        throw new Error("Generated image storage fetch redirected too many times.");
      }

      fetchUrl = new URL(location, fetchUrl);
    }

    if (!response) {
      throw new Error("Generated image could not be fetched for storage.");
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";

    if (!response.ok || !contentType.startsWith("image/")) {
      throw new Error("Generated image could not be fetched for storage.");
    }

    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("Generated image response was empty.");
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

        if (total > MAX_PROVIDER_IMAGE_BYTES) {
          controller.abort();
          throw new Error("Generated image is too large to store.");
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
      throw new Error("Generated image storage fetch timed out.");
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

  const fetched = await fetchProviderImage(providerUrl);
  const extension = extensionForContentType(fetched.contentType);

  if (extension === "bin") {
    throw new Error("Generated image type is not supported for storage.");
  }

  const storagePath = buildStoragePath(params, extension);
  const { error: uploadError } = await params.supabase.storage
    .from(STATIC_CREATIVE_STORAGE_BUCKET)
    .upload(storagePath, fetched.bytes, {
      cacheControl: "31536000",
      contentType: fetched.contentType,
      upsert: false,
    });

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
