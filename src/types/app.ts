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
};

type AppMembership = {
  id?: string;
  organization_id: string;
  user_id: string;
  role?: string | null;
};

export type AppContext = {
  user: AppUser;
  organization: AppOrganization;
  membership?: AppMembership | null;
};
