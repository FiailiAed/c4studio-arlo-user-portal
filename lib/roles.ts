export type AppRole = "family" | "referee" | "program_admin" | "league_admin";

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
};

export function getRoleConfig(role: string | undefined) {
  if (!role || !(role in ROLE_CONFIG)) return null;
  return ROLE_CONFIG[role as AppRole];
}
