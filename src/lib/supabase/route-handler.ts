import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export async function createRouteHandlerClient(): Promise<SupabaseClient<Database> | null> {
  return createServerSupabase();
}
