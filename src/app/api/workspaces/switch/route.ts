import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { assertSameOriginRequest } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { ensureUserProfile } from "@/lib/services/app-context";
import { ACTIVE_WORKSPACE_COOKIE, resolveWorkspaceAccessForUser } from "@/lib/services/workspace-access";

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

export async function POST(request: Request) {
  assertSameOriginRequest(request);
  const supabase = await createRouteHandlerClient();
  const admin = createAdminClient();
  const formData = await request.formData();
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const headerStore = await headers();
  const returnTo = safeReturnPath(headerStore.get("referer"));

  if (!supabase || !admin || !workspaceId) {
    redirect(returnTo);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await ensureUserProfile(admin as Parameters<typeof ensureUserProfile>[0], user);
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
