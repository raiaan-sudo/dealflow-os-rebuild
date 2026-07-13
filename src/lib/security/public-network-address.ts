import { isIP } from "node:net";

// Shared by every server-side fetch that pins DNS. Return true only for
// globally routable addresses; private, loopback, link-local, documentation,
// transition, multicast and reserved ranges fail closed.
export function isPublicNetworkAddress(address: string) {
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
  if (normalized.startsWith("::ffff:")) {
    return isPublicNetworkAddress(normalized.slice(7));
  }
  if (normalized.includes(".")) {
    const embeddedV4 = normalized.slice(normalized.lastIndexOf(":") + 1);
    if (isIP(embeddedV4) === 4) return isPublicNetworkAddress(embeddedV4);
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
