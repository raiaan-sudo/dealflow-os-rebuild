import "server-only";

import { createDecipheriv, createHash } from "node:crypto";

export type GhlSignedUserContext = {
  userId: string;
  companyId: string;
  activeLocation: string;
  email: string;
  appStatus: "live" | "draft";
};

function isProviderId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{3,160}$/.test(value);
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function deriveCryptoJsKeyAndIv(passphrase: Buffer, salt: Buffer) {
  const blocks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  while (Buffer.concat(blocks).length < 48) {
    previous = createHash("md5")
      .update(Buffer.concat([previous, passphrase, salt]))
      .digest();
    blocks.push(previous);
  }
  const material = Buffer.concat(blocks);
  return { key: material.subarray(0, 32), iv: material.subarray(32, 48) };
}

/**
 * HighLevel's documented signed-context flow currently emits the CryptoJS
 * passphrase/OpenSSL envelope. This parser is deliberately strict and never
 * logs plaintext or the protected shared secret.
 */
export function decryptGhlSignedUserContext(
  encryptedData: unknown,
  sharedSecret: string,
  options: { allowDraft?: boolean } = {},
): GhlSignedUserContext | null {
  if (
    typeof encryptedData !== "string" ||
    encryptedData.length < 24 ||
    encryptedData.length > 32_768 ||
    sharedSecret.length < 32
  ) {
    return null;
  }

  try {
    const envelope = Buffer.from(encryptedData, "base64");
    if (
      envelope.length < 32 ||
      envelope.subarray(0, 8).toString("ascii") !== "Salted__"
    ) {
      return null;
    }
    const salt = envelope.subarray(8, 16);
    const ciphertext = envelope.subarray(16);
    const { key, iv } = deriveCryptoJsKeyAndIv(Buffer.from(sharedSecret, "utf8"), salt);
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    if (plaintext.length > 16_384) return null;
    const parsed = JSON.parse(plaintext) as Record<string, unknown>;
    if (
      !isProviderId(parsed.userId) ||
      !isProviderId(parsed.companyId) ||
      !isProviderId(parsed.activeLocation) ||
      !isEmail(parsed.email) ||
      (parsed.appStatus !== "live" &&
        !(options.allowDraft === true && parsed.appStatus === "draft"))
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      companyId: parsed.companyId,
      activeLocation: parsed.activeLocation,
      email: parsed.email.trim().toLowerCase(),
      appStatus: parsed.appStatus,
    };
  } catch {
    return null;
  }
}
