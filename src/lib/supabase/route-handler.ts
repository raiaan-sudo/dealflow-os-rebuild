import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type CookieWriteResponse = Pick<NextResponse, "cookies" | "headers">;

export async function createRouteHandlerClient(
  response?: CookieWriteResponse,
): Promise<SupabaseClient<Database> | null> {
  return createServerSupabase(response);
}
