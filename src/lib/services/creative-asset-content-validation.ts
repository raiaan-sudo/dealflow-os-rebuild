import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";

export type CreativeAssetContentKind = "image" | "video";

export const MANUAL_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const MANUAL_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const GENERATED_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const GENERATED_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export type ValidatedCreativeAssetContent = {
  bytes: Uint8Array;
  contentLength: number;
  contentSha256: string;
  mimeType: string;
  extension: "png" | "jpg" | "webp" | "gif" | "mp4" | "mov" | "webm";
  kind: CreativeAssetContentKind;
};

export function normalizeCreativeAssetMimeType(value: string | null | undefined) {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

export function isSupportedCreativeAssetMimeType(
  value: string | null | undefined,
  kind: CreativeAssetContentKind,
) {
  const normalized = normalizeCreativeAssetMimeType(value);
  return (kind === "image" ? IMAGE_MIME_TYPES : VIDEO_MIME_TYPES).has(normalized);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function uint32be(bytes: Uint8Array, offset: number) {
  return bytes[offset]! * 0x1000000 +
    bytes[offset + 1]! * 0x10000 +
    bytes[offset + 2]! * 0x100 +
    bytes[offset + 3]!;
}

function uint32le(bytes: Uint8Array, offset: number) {
  return bytes[offset]! +
    bytes[offset + 1]! * 0x100 +
    bytes[offset + 2]! * 0x10000 +
    bytes[offset + 3]! * 0x1000000;
}

function endsWith(bytes: Uint8Array, suffix: readonly number[]) {
  if (bytes.length < suffix.length) return false;
  return suffix.every((value, index) => bytes[bytes.length - suffix.length + index] === value);
}

function detectSupportedContent(bytes: Uint8Array): {
  mimeType: string;
  extension: ValidatedCreativeAssetContent["extension"];
  kind: CreativeAssetContentKind;
} | null {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((value, index) => bytes[index] === value)) {
    if (
      bytes.length < 33 ||
      ascii(bytes, 12, 16) !== "IHDR" ||
      !endsWith(bytes, [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
    ) {
      throw new ApiError(422, "Creative PNG content is truncated.", "creative_asset_truncated");
    }
    return { mimeType: "image/png", extension: "png", kind: "image" };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    if (bytes.length < 8 || !endsWith(bytes, [0xff, 0xd9])) {
      throw new ApiError(422, "Creative JPEG content is truncated.", "creative_asset_truncated");
    }
    return { mimeType: "image/jpeg", extension: "jpg", kind: "image" };
  }

  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    const subtype = ascii(bytes, 12, 16);
    if (
      bytes.length < 20 ||
      !["VP8 ", "VP8L", "VP8X"].includes(subtype) ||
      uint32le(bytes, 4) + 8 !== bytes.length
    ) {
      throw new ApiError(422, "Creative WebP content is truncated.", "creative_asset_truncated");
    }
    return { mimeType: "image/webp", extension: "webp", kind: "image" };
  }

  const gifHeader = ascii(bytes, 0, 6);
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    if (bytes.length < 14 || bytes[bytes.length - 1] !== 0x3b) {
      throw new ApiError(422, "Creative GIF content is truncated.", "creative_asset_truncated");
    }
    return { mimeType: "image/gif", extension: "gif", kind: "image" };
  }

  if (ascii(bytes, 4, 8) === "ftyp") {
    const firstBoxLength = bytes.length >= 4 ? uint32be(bytes, 0) : 0;
    if (bytes.length < 16 || firstBoxLength < 16 || firstBoxLength > bytes.length) {
      throw new ApiError(422, "Creative ISO video content is truncated.", "creative_asset_truncated");
    }
    const quicktime = ascii(bytes, 8, 12) === "qt  ";
    return quicktime
      ? { mimeType: "video/quicktime", extension: "mov", kind: "video" }
      : { mimeType: "video/mp4", extension: "mp4", kind: "video" };
  }

  if (
    bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  ) {
    if (bytes.length < 8) {
      throw new ApiError(422, "Creative WebM content is truncated.", "creative_asset_truncated");
    }
    return { mimeType: "video/webm", extension: "webm", kind: "video" };
  }

  return null;
}

export function validateCreativeAssetContent(params: {
  bytes: Uint8Array | ArrayBuffer;
  declaredMimeType?: string | null;
  kind: CreativeAssetContentKind;
  maxBytes: number;
}): ValidatedCreativeAssetContent {
  const bytes = new Uint8Array(params.bytes);
  if (bytes.byteLength === 0) {
    throw new ApiError(422, "Creative asset content is empty.", "creative_asset_empty");
  }
  if (!Number.isSafeInteger(params.maxBytes) || params.maxBytes < 1) {
    throw new RangeError("Creative asset validation requires a positive byte limit.");
  }
  if (bytes.byteLength > params.maxBytes) {
    throw new ApiError(413, "Creative asset exceeds its bounded size limit.", "creative_asset_too_large");
  }
  if (bytes.byteLength < 4) {
    throw new ApiError(422, "Creative asset content is truncated.", "creative_asset_truncated");
  }

  const detected = detectSupportedContent(bytes);
  if (!detected) {
    throw new ApiError(
      415,
      "Creative asset has an unsupported or invalid file signature.",
      "creative_asset_signature_invalid",
    );
  }
  if (detected.kind !== params.kind) {
    throw new ApiError(
      415,
      `Creative asset signature is not a supported ${params.kind} format.`,
      "creative_asset_kind_mismatch",
    );
  }

  const declaredMimeType = normalizeCreativeAssetMimeType(params.declaredMimeType);
  if (declaredMimeType && !isSupportedCreativeAssetMimeType(declaredMimeType, params.kind)) {
    throw new ApiError(
      415,
      "Creative asset declared an unsupported MIME type.",
      "creative_asset_type_unsupported",
    );
  }
  if (declaredMimeType && declaredMimeType !== detected.mimeType) {
    throw new ApiError(
      415,
      "Creative asset MIME type does not match its verified file signature.",
      "creative_asset_mime_mismatch",
    );
  }

  return {
    bytes,
    contentLength: bytes.byteLength,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    mimeType: detected.mimeType,
    extension: detected.extension,
    kind: detected.kind,
  };
}

export async function validateManualCreativeAssetFile(params: {
  file: File;
  kind: "image" | "thumbnail" | "video";
}) {
  const contentKind = params.kind === "video" ? "video" : "image";
  const maxBytes = contentKind === "video" ? MANUAL_VIDEO_MAX_BYTES : MANUAL_IMAGE_MAX_BYTES;
  if (params.file.size === 0) {
    throw new ApiError(422, "Creative asset content is empty.", "creative_asset_empty");
  }
  if (params.file.size > maxBytes) {
    throw new ApiError(413, "Creative asset exceeds its bounded size limit.", "creative_asset_too_large");
  }
  return validateCreativeAssetContent({
    bytes: await params.file.arrayBuffer(),
    declaredMimeType: params.file.type,
    kind: contentKind,
    maxBytes,
  });
}
