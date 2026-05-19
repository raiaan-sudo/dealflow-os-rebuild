import {
  Activity,
  BarChart3,
  BrainCircuit,
  Bug,
  Rocket,
  Sparkles,
} from "lucide-react";

export const appNavigation = [
  { href: "/dashboard", label: "Command Center", icon: Sparkles },
  { href: "/builder", label: "Builder", icon: BarChart3 },
  { href: "/launch", label: "Launch", icon: Rocket },
] as const;

export const adminNavigation = [
  { href: "/admin/control-room", label: "Control Room", icon: Activity },
  { href: "/admin/command-center", label: "Command Center", icon: BrainCircuit },
  { href: "/admin/launch-monitor", label: "Launch Monitor", icon: BarChart3 },
  { href: "/admin/issues", label: "Issue Logs", icon: Bug },
] as const;
