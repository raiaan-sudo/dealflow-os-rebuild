import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_VERSION = 1;
const STATE_TTL_MS = 10 * 60 * 1000;

export type MetaOAuthStatePayload = {
  exp: number;
  nonce: string;
  organizationId: string;
  returnTo: string;
  userId: string;
  v: typeof STATE_VERSION;
};

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function signPayload(encodedPayload: string, secret: string) {
  return toBase64Url(createHmac("sha256", secret).update(encodedPayload).digest());
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isPayload(value: unknown): value is MetaOAuthStatePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<MetaOAuthStatePayload>;

  return (
    payload.v === STATE_VERSION &&
    typeof payload.nonce === "string" &&
    payload.nonce.length >= 16 &&
    typeof payload.organizationId === "string" &&
    payload.organizationId.length > 0 &&
    typeof payload.userId === "string" &&
    payload.userId.length > 0 &&
    typeof payload.returnTo === "string" &&
    payload.returnTo.startsWith("/") &&
    !payload.returnTo.startsWith("//") &&
    typeof payload.exp === "number" &&
    Number.isFinite(payload.exp)
  );
}

export function createMetaOAuthState(params: {
  organizationId: string;
  returnTo: string;
  secret: string;
  userId: string;
}) {
  const payload: MetaOAuthStatePayload = {
    v: STATE_VERSION,
    nonce: toBase64Url(randomBytes(18)),
    organizationId: params.organizationId,
    userId: params.userId,
    returnTo: params.returnTo,
    exp: Date.now() + STATE_TTL_MS,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, params.secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyMetaOAuthState(state: string | null, secret: string): MetaOAuthStatePayload | null {
  if (!state || state.length > 2_048) {
    return null;
  }

  const [encodedPayload, signature, extra] = state.split(".");

  if (!encodedPayload || !signature || extra) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as unknown;

    if (!isPayload(payload) || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
