import type { SupabaseClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import type { Database } from "@/lib/supabase/types";

export type WorkspaceOption = {
  id: string;
  name: string;
  role: string;
};

type WorkspaceSelectionClient = SupabaseClient<Database>;

export async function listWorkspaceOptions(
  supabase: WorkspaceSelectionClient,
  userId: string,
): Promise<WorkspaceOption[]> {
  const { data: membershipsRaw, error: membershipsError } = await supabase
    .from("organization_memberships")
    .select("organization_id,role,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (membershipsError) throw membershipsError;

  const memberships = (membershipsRaw ?? []) as Array<{
    organization_id: string;
    role: string | null;
  }>;
  const organizationIds = [
    ...new Set(
      memberships
        .map((membership) => membership.organization_id)
        .filter((organizationId): organizationId is string => Boolean(organizationId)),
    ),
  ];
  if (organizationIds.length === 0) return [];

  const { data: organizationsRaw, error: organizationsError } = await supabase
    .from("organizations")
    .select("id,name")
    .in("id", organizationIds);
  if (organizationsError) throw organizationsError;

  const organizationNames = new Map(
    ((organizationsRaw ?? []) as Array<{ id: string; name: string | null }>).map(
      (organization) => [
        organization.id,
        organization.name?.trim() || "DealFlow Workspace",
      ],
    ),
  );

  return memberships.flatMap((membership) => {
    const name = organizationNames.get(membership.organization_id);
    return name
      ? [
          {
            id: membership.organization_id,
            name,
            role: membership.role?.trim().toLowerCase() || "member",
          },
        ]
      : [];
  });
}

export async function listCurrentUserWorkspaceOptions() {
  const supabase = await createRouteHandlerClient();
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listWorkspaceOptions(supabase, user.id);
}

export async function hasWorkspaceMembership(
  supabase: WorkspaceSelectionClient,
  userId: string,
  organizationId: string,
) {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return (data as { organization_id?: string } | null)?.organization_id === organizationId;
}

export function sanitizeWorkspaceReturnTo(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";

  let parsed: URL;
  try {
    parsed = new URL(value, "https://workspace.invalid");
  } catch {
    return "/dashboard";
  }

  if (parsed.origin !== "https://workspace.invalid") return "/dashboard";
  if (
    parsed.pathname === "/api" ||
    parsed.pathname.startsWith("/api/") ||
    parsed.pathname.endsWith("/workspace/select") ||
    parsed.pathname.endsWith("/login")
  ) {
    return "/dashboard";
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
