import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
import { getSupabaseAuthCookieOptions } from "@/lib/supabase/cookie-options";
import type { Database } from "@/lib/supabase/types";

export function createClient(): SupabaseClient<Database> | null {
  const env = getSupabaseEnv();

  if (!env) {
    return null;
  }

  return createBrowserClient<Database>(env.url, env.anonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(),
  });
}
