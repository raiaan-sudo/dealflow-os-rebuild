import type { CookieOptionsWithName } from "@supabase/ssr";

export function getSupabaseAuthCookieOptions(): CookieOptionsWithName {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    path: "/",
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    partitioned: isProduction,
  };
}
