export type AppRole = "family" | "referee" | "program_admin" | "league_admin" | "super_admin";

export function hasAnyRole(roles: string[] | undefined, allowed: string[]): boolean {
  return !!roles?.some((r) => allowed.includes(r));
}

const ROLE_CONFIG: Record<AppRole, { label: string; description: string; permissions: string[] }> = {
  family: {
    label: "Family",
    description: "Standard member account for families and players.",
    permissions: [
      "View and edit your profile",
      "Manage player profiles",
      "Complete registrations",
    ],
  },
  referee: {
    label: "Referee",
    description: "Referee account with scheduling access.",
    permissions: [
      "All Family permissions",
      "View game schedules",
      "Manage referee availability",
    ],
  },
  program_admin: {
    label: "Program Admin",
    description: "Manages a specific program or division.",
    permissions: [
      "All Referee permissions",
      "Manage program rosters",
      "View all registrations for your program",
    ],
  },
  league_admin: {
    label: "League Admin",
    description: "Full access across all programs and users.",
    permissions: [
      "All Program Admin permissions",
      "Manage all programs and leagues",
      "Assign user roles",
      "Access all reports",
    ],
  },
  super_admin: {
    label: "Super Admin",
    description: "Full league admin access, plus the ability to impersonate any account.",
    permissions: [
      "All League Admin permissions",
      "Impersonate any user account",
    ],
  },
};

export function getRoleConfig(role: string | undefined) {
  if (!role || !(role in ROLE_CONFIG)) return null;
  return ROLE_CONFIG[role as AppRole];
}

export const DASHBOARD_PLACEHOLDERS: Record<
  Exclude<AppRole, "league_admin" | "family" | "super_admin" | "referee">,
  { title: string; description: string }
> = {
  program_admin: {
    title: "Program Rosters",
    description: "Manage your program's rosters soon.",
  },
};
