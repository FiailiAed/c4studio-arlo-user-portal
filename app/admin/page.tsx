"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getRoleConfig, type AppRole } from "@/lib/roles";

export default function AdminPage() {
  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <AdminOverviewCard />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Manage Users</CardTitle>
              <CardDescription>Assign roles and review the full user list.</CardDescription>
            </div>
            <Link href="/admin/users" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Open
            </Link>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Invite Users</CardTitle>
              <CardDescription>Send a role-scoped email invitation.</CardDescription>
            </div>
            <Link href="/admin/invite" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Open
            </Link>
          </CardHeader>
        </Card>
      </div>
    </main>
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
