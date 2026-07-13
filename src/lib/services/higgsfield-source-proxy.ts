import { createHmac, timingSafeEqual } from "node:crypto";
import { getInternalSystemJobSecrets, getPublicAppUrl } from "@/lib/env";

const TOKEN_VERSION = "dealflow-higgsfield-source-v1";
const TOKEN_LIFETIME_SECONDS = 20 * 60;
const MAX_CLOCK_SKEW_SECONDS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HiggsfieldSourceIdentity = {
  assetId: string;
  dispatchId: string;
  organizationId: string;
  userId: string;
  campaignId: string;
};

function validIdentity(identity: HiggsfieldSourceIdentity) {
  return Object.values(identity).every((value) => UUID.test(value));
}

function message(identity: HiggsfieldSourceIdentity, expiresAt: number) {
  return [
    TOKEN_VERSION,
    identity.assetId,
    identity.dispatchId,
    identity.organizationId,
    identity.userId,
    identity.campaignId,
    String(expiresAt),
  ].join("|");
}

function signature(secret: string, identity: HiggsfieldSourceIdentity, expiresAt: number) {
  return createHmac("sha256", secret).update(message(identity, expiresAt)).digest("hex");
}

function configuredSecrets() {
  return getInternalSystemJobSecrets().filter((secret) => secret.length >= 32);
}

export function createHiggsfieldSourceProxyUrl(
  identity: HiggsfieldSourceIdentity,
  now = Date.now(),
) {
  if (!validIdentity(identity)) {
    throw new Error("Higgsfield source proxy identity is invalid.");
  }
  const secret = configuredSecrets()[0];
  if (!secret) {
    throw new Error("Higgsfield source proxy signing authority is unavailable.");
  }
  const base = new URL(getPublicAppUrl());
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    base.hostname.toLowerCase(),
  );
  if (
    base.username ||
    base.password ||
    base.hash ||
    base.search ||
    (base.protocol !== "https:" && !(process.env.NODE_ENV === "test" && loopback))
  ) {
    throw new Error("Higgsfield source proxy requires the canonical HTTPS application origin.");
  }
  const expiresAt = Math.floor(now / 1_000) + TOKEN_LIFETIME_SECONDS;
  const url = new URL(
    `/api/provider-media/higgsfield-source/${encodeURIComponent(identity.assetId)}`,
    base,
  );
  url.searchParams.set("dispatch", identity.dispatchId);
  url.searchParams.set("organization", identity.organizationId);
  url.searchParams.set("user", identity.userId);
  url.searchParams.set("campaign", identity.campaignId);
  url.searchParams.set("expires", String(expiresAt));
  url.searchParams.set("token", signature(secret, identity, expiresAt));
  return url.toString();
}

export function verifyHiggsfieldSourceProxyRequest(params: {
  assetId: string;
  url: URL;
  now?: number;
}): HiggsfieldSourceIdentity | null {
  const identity = {
    assetId: params.assetId,
    dispatchId: params.url.searchParams.get("dispatch") ?? "",
    organizationId: params.url.searchParams.get("organization") ?? "",
    userId: params.url.searchParams.get("user") ?? "",
    campaignId: params.url.searchParams.get("campaign") ?? "",
  } satisfies HiggsfieldSourceIdentity;
  const expiresAt = Number(params.url.searchParams.get("expires"));
  const token = params.url.searchParams.get("token") ?? "";
  const nowSeconds = Math.floor((params.now ?? Date.now()) / 1_000);
  if (
    !validIdentity(identity) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < nowSeconds - MAX_CLOCK_SKEW_SECONDS ||
    expiresAt > nowSeconds + TOKEN_LIFETIME_SECONDS + MAX_CLOCK_SKEW_SECONDS ||
    !/^[a-f0-9]{64}$/.test(token)
  ) {
    return null;
  }

  const candidate = Buffer.from(token, "hex");
  const accepted = configuredSecrets().some((secret) => {
    const expected = Buffer.from(signature(secret, identity, expiresAt), "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
  return accepted ? identity : null;
}
