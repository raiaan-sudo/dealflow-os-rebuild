type AppUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

type AppOrganization = {
  id: string;
  name?: string | null;
  slug?: string | null;
  owner_user_id?: string | null;
  plan_tier?: string | null;
  partner_id?: string | null;
};

type AppMembership = {
  id?: string;
  organization_id: string;
  user_id: string;
  role?: string | null;
};

type AppProfile = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  [key: string]: unknown;
};

type AppBusinessProfile = {
  id?: string;
  organization_id?: string | null;
  business_name?: string | null;
  primary_offer?: string | null;
  [key: string]: unknown;
};

export type AppContext = {
  user: AppUser;
  profile?: AppProfile | null;
  organization: AppOrganization;
  membership?: AppMembership | null;
  businessProfile?: AppBusinessProfile | null;
  partner?: {
    id: string;
    slug?: string | null;
    brand_name?: string | null;
    legal_name?: string | null;
    logo_url?: string | null;
    favicon_url?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
    support_email?: string | null;
    support_phone?: string | null;
    powered_by_dealflow?: boolean | null;
    status?: string | null;
  } | null;
  activeWorkspaceAccess?: "owner" | "member" | "partner" | "platform_admin";
};
