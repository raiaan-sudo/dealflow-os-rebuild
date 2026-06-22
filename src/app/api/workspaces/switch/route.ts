import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { assertSameOriginRequest } from "@/lib/api/route";
import { isInternalAdminEmail } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { ensureUserProfile } from "@/lib/services/app-context";
import { ACTIVE_WORKSPACE_COOKIE, resolveWorkspaceAccessForUser } from "@/lib/services/workspace-access";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeReturnPath(value: string | null) {
  if (!value) {
    return "/dashboard";
  }

  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
  }
}

async function resolveAdminWorkspaceLookup(admin: NonNullable<ReturnType<typeof createAdminClient>>, value: string) {
  const query = value.trim();

  if (!query) {
    return null;
  }

  if (UUID_PATTERN.test(query)) {
    const { data } = await admin
      .from("organizations")
      .select("id")
      .eq("id", query)
      .maybeSingle();
    const row = data as { id?: string | null } | null;

    return typeof row?.id === "string" ? row.id : null;
  }

  const { data } = await admin
    .from("organizations")
    .select("id,name,slug")
    .or(`name.eq.${query},slug.eq.${query}`)
    .limit(2);
  const rows = (Array.isArray(data) ? data : []) as Array<{ id?: string | null }>;

  if (rows.length === 1 && typeof rows[0]?.id === "string") {
    return rows[0].id;
  }

  const { data: fuzzy } = await admin
    .from("organizations")
    .select("id,name,slug")
    .ilike("name", `%${query.replace(/[%_]/g, "\\$&")}%`)
    .limit(2);
  const fuzzyRows = (Array.isArray(fuzzy) ? fuzzy : []) as Array<{ id?: string | null }>;

  return fuzzyRows.length === 1 && typeof fuzzyRows[0]?.id === "string"
    ? fuzzyRows[0].id
    : null;
}

export async function POST(request: Request) {
  assertSameOriginRequest(request);
  const supabase = await createRouteHandlerClient();
  const admin = createAdminClient();
  const formData = await request.formData();
  let workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const workspaceLookup = String(formData.get("workspaceLookup") ?? "").trim();
  const headerStore = await headers();
  const returnTo = safeReturnPath(headerStore.get("referer"));

  if (!supabase || !admin) {
    redirect(returnTo);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await ensureUserProfile(admin as Parameters<typeof ensureUserProfile>[0], user);

  if (!workspaceId && workspaceLookup && isInternalAdminEmail(profile.email ?? null)) {
    workspaceId = (await resolveAdminWorkspaceLookup(admin, workspaceLookup)) ?? "";
  }

  if (!workspaceId) {
    redirect(returnTo);
  }

  const access = await resolveWorkspaceAccessForUser(admin, profile, workspaceId);

  if (!access) {
    redirect(returnTo);
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, access.organization.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/dashboard");
}
