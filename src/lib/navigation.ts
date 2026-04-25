import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  Shield,
  Sparkles,
} from "lucide-react";

export const appNavigation = [
  { href: "/dashboard", label: "Command Center", icon: Sparkles },
  { href: "/campaign", label: "Campaign", icon: BarChart3 },
  { href: "/pipeline", label: "Pipeline", icon: BriefcaseBusiness },
] as const;

export const adminNavigation = [
  { href: "/admin/accounts", label: "Accounts", icon: Shield },
  { href: "/admin/imports", label: "Imports", icon: Activity },
  { href: "/admin/diagnostics", label: "Diagnostics", icon: BarChart3 },
] as const;
