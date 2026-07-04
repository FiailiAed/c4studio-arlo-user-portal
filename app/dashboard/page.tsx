"use client";

import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DASHBOARD_PLACEHOLDERS, hasAnyRole, type AppRole } from "@/lib/roles";

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

  const roles = (profile?.roles as AppRole[] | undefined) ?? [];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl space-y-6">
        {hasAnyRole(roles, ["league_admin", "super_admin"]) && <AdminLinkCard />}
        {roles.includes("family") && <PlayersLinkCard />}
        {roles.includes("referee") && <RefereeLinkCard />}
        {roles.includes("program_admin") && <RolePlaceholderCard role="program_admin" />}
        {roles.length === 0 && <RolePlaceholderCard role={undefined} />}
      </div>
    </main>
  );
}

function RolePlaceholderCard({
  role,
}: {
  role: Exclude<AppRole, "league_admin" | "family" | "super_admin" | "referee"> | undefined;
}) {
  const placeholder = role ? DASHBOARD_PLACEHOLDERS[role] : undefined;

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

function AdminLinkCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Admin Dashboard</CardTitle>
          <CardDescription>Manage users and view league-wide stats.</CardDescription>
        </div>
        <Link href="/admin" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Open
        </Link>
      </CardHeader>
    </Card>
  );
}

function PlayersLinkCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">My Players</CardTitle>
          <CardDescription>Add and manage your players&apos; profiles.</CardDescription>
        </div>
        <Link href="/players" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Open
        </Link>
      </CardHeader>
    </Card>
  );
}

function RefereeLinkCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Game Schedules</CardTitle>
          <CardDescription>View your assignments and accept upcoming games.</CardDescription>
        </div>
        <Link href="/referee" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Open
        </Link>
      </CardHeader>
    </Card>
  );
}
