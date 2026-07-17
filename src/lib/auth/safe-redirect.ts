import { parseProductLocalePathname } from "@/lib/i18n/routing";

export function getSafeAuthRedirectPath(
  value: string | null | undefined,
  origin: string,
  defaultPath: string,
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return defaultPath;
  }

  try {
    const expectedOrigin = new URL(origin).origin;
    const resolved = new URL(value, expectedOrigin);
    const productPathname = parseProductLocalePathname(resolved.pathname).pathname;

    if (
      resolved.origin !== expectedOrigin ||
      productPathname === "/" ||
      productPathname === "/login" ||
      productPathname.startsWith("/login/") ||
      productPathname === "/auth/callback" ||
      productPathname.startsWith("/auth/callback/")
    ) {
      return defaultPath;
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return defaultPath;
  }
}
