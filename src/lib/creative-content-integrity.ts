import "server-only";

import { createHash } from "node:crypto";
import { lookup as lookupDns } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import { ApiError } from "@/lib/api/route";
import { getPublicAppUrl } from "@/lib/env";
import { isPublicNetworkAddress } from "@/lib/security/public-network-address";

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
  return isPublicNetworkAddress(address);
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

type VerifiedCreativeImage = {
  bytes: Uint8Array;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  sha256: string;
};

function hasSupportedImageSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/png") {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return contentType === "image/webp" &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

function consumePinnedImage(response: IncomingMessage) {
  return new Promise<VerifiedCreativeImage>((resolve, reject) => {
    const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
    const normalizedContentType = contentType.split(";", 1)[0]?.trim() ?? "";
    const contentLength = Number(response.headers["content-length"] ?? "0");
    if (
      (response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300 ||
      !["image/png", "image/jpeg", "image/webp"].includes(normalizedContentType) ||
      (contentLength > 0 && contentLength > MAX_CREATIVE_BYTES)
    ) {
      response.resume();
      reject(new ApiError(409, "The selected creative bytes are not available for immutable approval.", "meta_creative_asset_bytes_unavailable"));
      return;
    }
    const hash = createHash("sha256");
    const chunks: Buffer[] = [];
    let total = 0;
    response.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > MAX_CREATIVE_BYTES) {
        response.destroy(new Error("creative_asset_too_large"));
        return;
      }
      hash.update(chunk);
      chunks.push(Buffer.from(chunk));
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
      const bytes = Buffer.concat(chunks);
      if (!hasSupportedImageSignature(bytes, normalizedContentType)) {
        reject(new ApiError(
          409,
          "The selected creative content does not match its declared image type.",
          "meta_creative_asset_signature_invalid",
        ));
        return;
      }
      resolve({
        bytes,
        contentType: normalizedContentType as VerifiedCreativeImage["contentType"],
        sha256: hash.digest("hex"),
      });
    });
  });
}

async function requestPinnedImage(
  resolved: Awaited<ReturnType<typeof resolvePinnedCreativeUrl>>,
) {
  return new Promise<{ image?: VerifiedCreativeImage; redirect?: string }>((resolve, reject) => {
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
        resolve({ image: await consumePinnedImage(response) });
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
    if (result.image) return result.image.sha256;
    if (!result.redirect || redirect === MAX_REDIRECTS) {
      throw new ApiError(409, "The selected creative redirect could not be verified.", "meta_creative_asset_redirect_invalid");
    }
    resolved = await resolvePinnedCreativeUrl(result.redirect, lookupDns);
  }
  throw new ApiError(409, "The selected creative could not be verified.", "meta_creative_asset_bytes_unavailable");
}

export async function downloadVerifiedCreativeImage(
  imageUrl: string,
): Promise<VerifiedCreativeImage> {
  let resolved = await resolvePinnedCreativeUrl(imageUrl, lookupDns);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const result = await requestPinnedImage(resolved);
    if (result.image) return result.image;
    if (!result.redirect || redirect === MAX_REDIRECTS) {
      throw new ApiError(
        409,
        "The selected creative redirect could not be verified.",
        "meta_creative_asset_redirect_invalid",
      );
    }
    resolved = await resolvePinnedCreativeUrl(result.redirect, lookupDns);
  }
  throw new ApiError(
    409,
    "The selected creative could not be verified.",
    "meta_creative_asset_bytes_unavailable",
  );
}
