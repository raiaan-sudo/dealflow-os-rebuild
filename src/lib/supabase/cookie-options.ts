import type { CookieOptionsWithName } from "@supabase/ssr";

export function getSupabaseAuthCookieOptions(): CookieOptionsWithName {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    path: "/",
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    partitioned: isProduction,
  };
}
