import "server-only";

import { createHash } from "node:crypto";
import { lookup as lookupDns } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import { ApiError } from "@/lib/api/route";
import { getPublicAppUrl } from "@/lib/env";

const MAX_CREATIVE_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TRUSTED_ASSET_HOST_SUFFIXES = [
  "blob.core.windows.net",
  "openai.com",
  "supabase.co",
  "supabase.in",
  "replicate.delivery",
  "higgsfield.ai",
] as const;

type Lookup = typeof lookupDns;

function isTrustedAssetHost(host: string) {
  let firstPartyHost = "";
  try {
    firstPartyHost = new URL(getPublicAppUrl()).hostname.toLowerCase();
  } catch {
    // The explicit provider allowlist remains available during config checks.
  }
  return host === firstPartyHost || TRUSTED_ASSET_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function isPublicCreativeAddress(address: string) {
  const normalized = address.toLowerCase();
  const version = isIP(normalized);
  if (version === 4) {
    const [a, b, c] = normalized.split(".").map(Number);
    return !(
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (normalized.startsWith("::ffff:")) return isPublicCreativeAddress(normalized.slice(7));
  if (normalized.includes(".")) {
    const embeddedV4 = normalized.slice(normalized.lastIndexOf(":") + 1);
    if (isIP(embeddedV4) === 4) return isPublicCreativeAddress(embeddedV4);
  }
  if (version !== 6) return false;
  return !(
    normalized === "::" || normalized === "::1" ||
    normalized.startsWith("64:ff9b:1:") || normalized.startsWith("100:") ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:") || normalized.startsWith("2002:")
  );
}

async function resolvePinnedCreativeUrl(value: string, lookup: Lookup) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(409, "The selected creative URL is invalid.", "meta_creative_asset_identity_invalid");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" || url.username || url.password || url.port ||
    !host || isIP(host) || !isTrustedAssetHost(host)
  ) {
    throw new ApiError(409, "The selected creative must use a trusted public HTTPS asset host.", "meta_creative_asset_identity_invalid");
  }
  const addresses = await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some((entry) => !isPublicCreativeAddress(entry.address))) {
    throw new ApiError(409, "The selected creative host could not be verified as public.", "meta_creative_asset_identity_invalid");
  }
  return { url, address: addresses[0]!.address, family: addresses[0]!.family };
}

function consumePinnedImage(response: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
    const contentLength = Number(response.headers["content-length"] ?? "0");
    if (
      (response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300 ||
      !contentType.startsWith("image/") ||
      (contentLength > 0 && contentLength > MAX_CREATIVE_BYTES)
    ) {
      response.resume();
      reject(new ApiError(409, "The selected creative bytes are not available for immutable approval.", "meta_creative_asset_bytes_unavailable"));
      return;
    }
    const hash = createHash("sha256");
    let total = 0;
    response.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > MAX_CREATIVE_BYTES) {
        response.destroy(new Error("creative_asset_too_large"));
        return;
      }
      hash.update(chunk);
    });
    response.once("error", (error: Error) => reject(
      new ApiError(
        409,
        error.message === "creative_asset_too_large"
          ? "The selected creative is too large for immutable approval."
          : "The selected creative bytes could not be verified.",
        error.message === "creative_asset_too_large"
          ? "meta_creative_asset_too_large"
          : "meta_creative_asset_bytes_unavailable",
      ),
    ));
    response.once("end", () => {
      if (total === 0) {
        reject(new ApiError(409, "The selected creative is empty.", "meta_creative_asset_bytes_unavailable"));
        return;
      }
      resolve(hash.digest("hex"));
    });
  });
}

async function requestPinnedImage(
  resolved: Awaited<ReturnType<typeof resolvePinnedCreativeUrl>>,
) {
  return new Promise<{ digest?: string; redirect?: string }>((resolve, reject) => {
    const request = httpsRequest(resolved.url, {
      method: "GET",
      headers: { Accept: "image/*", "User-Agent": "DealFlow-Creative-Integrity/1" },
      lookup: (_hostname, _options, callback) => callback(null, resolved.address, resolved.family),
      timeout: 15_000,
    }, async (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        const location = response.headers.location;
        response.resume();
        resolve({ redirect: location ? new URL(location, resolved.url).toString() : "" });
        return;
      }
      try {
        resolve({ digest: await consumePinnedImage(response) });
      } catch (error) {
        reject(error);
      }
    });
    request.once("timeout", () => request.destroy(new Error("creative_asset_timeout")));
    request.once("error", () => reject(
      new ApiError(409, "The selected creative bytes could not be verified.", "meta_creative_asset_bytes_unavailable"),
    ));
    request.end();
  });
}

export function sha256CreativeContent(content: Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

export function resolveCreativeContentSha256(imageUrl: string): Promise<string>;
export function resolveCreativeContentSha256(imageUrl: null): Promise<null>;
export async function resolveCreativeContentSha256(imageUrl: string | null): Promise<string | null> {
  if (!imageUrl) return null;
  let resolved = await resolvePinnedCreativeUrl(imageUrl, lookupDns);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const result = await requestPinnedImage(resolved);
    if (result.digest) return result.digest;
    if (!result.redirect || redirect === MAX_REDIRECTS) {
      throw new ApiError(409, "The selected creative redirect could not be verified.", "meta_creative_asset_redirect_invalid");
    }
    resolved = await resolvePinnedCreativeUrl(result.redirect, lookupDns);
  }
  throw new ApiError(409, "The selected creative could not be verified.", "meta_creative_asset_bytes_unavailable");
}
