import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export function createAdminClient(): SupabaseClient<Database> | null {
  const env = getServiceRoleEnv();

  if (!env) {
    return null;
  }

  return createSupabaseClient<Database>(env.url, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
