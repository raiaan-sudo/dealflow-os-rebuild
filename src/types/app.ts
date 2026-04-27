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
};
