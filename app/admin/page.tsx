"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getRoleConfig, type AppRole } from "@/lib/roles";
import { useOrgId } from "@/lib/use-org-id";

export default function AdminPage() {
  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <ArloAlertCard />
        <DisputeAlertCard />
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

const ALERT_WINDOW_MS = 48 * 60 * 60 * 1000;

function ArloAlertCard() {
  const orgId = useOrgId();
  const games = useQuery(api.games.listGames, orgId ? { orgId } : "skip");
  const [now] = useState(() => Date.now());

  if (!games) return null;

  const atRisk = games
    .filter((g) => g.status === "PENDING_ASSIGNMENT" && g.startTime - now < ALERT_WINDOW_MS && g.startTime > now)
    .sort((a, b) => a.startTime - b.startTime);

  if (atRisk.length === 0) return null;

  return (
    <Card className="border-red-600 bg-red-50 dark:bg-red-950/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base text-red-700 dark:text-red-400">
            ARLO Alert: {atRisk.length} game{atRisk.length === 1 ? "" : "s"} need a referee
          </CardTitle>
          <CardDescription className="text-red-700/80 dark:text-red-400/80">
            Kickoff is within 48 hours and no referee has accepted yet.
          </CardDescription>
        </div>
        <Link href="/admin/schedule" className={cn(buttonVariants({ variant: "destructive", size: "sm" }))}>
          Open Schedule
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {atRisk.map((g) => (
          <div
            key={g._id}
            className="flex items-center justify-between rounded-md border border-red-200 bg-white px-3 py-2 text-sm dark:border-red-900 dark:bg-transparent"
          >
            <span>
              {g.homeTeamName} vs {g.awayTeamName} — {g.fieldName}
            </span>
            <span className="text-muted-foreground">{new Date(g.startTime).toLocaleString()}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DisputeAlertCard() {
  const orgId = useOrgId();
  const disputes = useQuery(api.disputes.listOpenDisputes, orgId ? { orgId } : "skip");

  if (!disputes || disputes.length === 0) return null;

  return (
    <Card className="border-red-600 bg-red-50 dark:bg-red-950/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base text-red-700 dark:text-red-400">
            ARLO Alert: {disputes.length} dispute{disputes.length === 1 ? "" : "s"} need review
          </CardTitle>
          <CardDescription className="text-red-700/80 dark:text-red-400/80">
            A coach has disputed a submitted score.
          </CardDescription>
        </div>
        <Link href="/admin/exceptions" className={cn(buttonVariants({ variant: "destructive", size: "sm" }))}>
          Open Exceptions
        </Link>
      </CardHeader>
    </Card>
  );
}

function AdminOverviewCard() {
  const orgId = useOrgId();
  const allUsers = useQuery(api.users.listAll, orgId ? { orgId } : "skip");

  if (!allUsers) return null;

  const counts: Record<AppRole, number> = {
    family: 0,
    referee: 0,
    program_admin: 0,
    coach: 0,
    league_admin: 0,
    super_admin: 0,
  };
  let unassigned = 0;
  for (const u of allUsers) {
    if (u.roles && u.roles.length > 0) {
      for (const r of u.roles) {
        if (r in counts) counts[r as AppRole]++;
      }
    } else {
      unassigned++;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">League Overview</CardTitle>
        <CardDescription>
          {allUsers.length} total users · role counts may overlap since a user can hold multiple roles
        </CardDescription>
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
