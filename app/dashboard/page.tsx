"use client";

import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DASHBOARD_PLACEHOLDERS, getRoleConfig, type AppRole } from "@/lib/roles";

export default function DashboardPage() {
  const { user: clerkUser } = useUser();
  const profile = useQuery(api.users.getCurrentUser);
  const upsertUser = useMutation(api.users.upsertUser);

  useEffect(() => {
    if (!clerkUser) return;
    upsertUser({
      firstName: clerkUser.firstName ?? undefined,
      lastName: clerkUser.lastName ?? undefined,
      email: clerkUser.primaryEmailAddress?.emailAddress,
    });
  }, [clerkUser?.id, upsertUser]);

  if (profile === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  const role = profile?.role as AppRole | undefined;

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl space-y-6">
        {role === "league_admin" ? <AdminOverviewCard /> : <RolePlaceholderCard role={role} />}
      </div>
    </main>
  );
}

function RolePlaceholderCard({ role }: { role: AppRole | undefined }) {
  const placeholder = role && role !== "league_admin" ? DASHBOARD_PLACEHOLDERS[role] : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{placeholder?.title ?? "Dashboard"}</CardTitle>
          <CardDescription>
            {placeholder?.description ?? "Contact a league admin to get a role assigned to your account."}
          </CardDescription>
        </div>
        {placeholder && <Badge variant="secondary">Coming Soon</Badge>}
      </CardHeader>
    </Card>
  );
}

function AdminOverviewCard() {
  const allUsers = useQuery(api.users.listAll);

  if (!allUsers) return null;

  const counts: Record<AppRole, number> = {
    family: 0,
    referee: 0,
    program_admin: 0,
    league_admin: 0,
  };
  let unassigned = 0;
  for (const u of allUsers) {
    if (u.role && u.role in counts) counts[u.role as AppRole]++;
    else unassigned++;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">League Overview</CardTitle>
        <CardDescription>{allUsers.length} total users</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {(Object.keys(counts) as AppRole[]).map((r) => (
            <div key={r} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">{getRoleConfig(r)?.label ?? r}</span>
              <Badge variant="secondary">{counts[r]}</Badge>
            </div>
          ))}
          {unassigned > 0 && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">Unassigned</span>
              <Badge variant="outline">{unassigned}</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
