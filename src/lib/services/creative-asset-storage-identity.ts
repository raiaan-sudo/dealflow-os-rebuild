export const MANUAL_CREATIVE_STORAGE_BUCKET = "creative-assets";

const SAFE_ID_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/;
const SAFE_FILE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

export type ManualCreativeStorageIdentity = {
  userId: string;
  campaignId: string;
  providerName: string | null | undefined;
  storageBucket: string | null | undefined;
  storagePath: string | null | undefined;
};

function isSafeIdSegment(value: string) {
  return SAFE_ID_SEGMENT.test(value);
}

function isSafeFileSegment(value: string) {
  return SAFE_FILE_SEGMENT.test(value) && !value.includes("..");
}

export function buildManualCreativeStoragePath(params: {
  userId: string;
  campaignId: string;
  fileName: string;
}) {
  if (
    !isSafeIdSegment(params.userId) ||
    !isSafeIdSegment(params.campaignId) ||
    !isSafeFileSegment(params.fileName)
  ) {
    throw new Error("Manual creative storage identity contains an unsafe path segment.");
  }

  return `${params.userId}/${params.campaignId}/${params.fileName}`;
}

export function isCanonicalManualCreativeStorageIdentity(
  identity: ManualCreativeStorageIdentity,
) {
  if (
    identity.providerName !== "manual_upload" ||
    identity.storageBucket !== MANUAL_CREATIVE_STORAGE_BUCKET ||
    typeof identity.storagePath !== "string" ||
    !isSafeIdSegment(identity.userId) ||
    !isSafeIdSegment(identity.campaignId)
  ) {
    return false;
  }

  const expectedPrefix = `${identity.userId}/${identity.campaignId}/`;

  if (!identity.storagePath.startsWith(expectedPrefix)) {
    return false;
  }

  return isSafeFileSegment(identity.storagePath.slice(expectedPrefix.length));
}
