"use client";

import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getRoleConfig, type AppRole } from "@/lib/roles";
import { useActiveOrg } from "@/components/active-org-provider";

export default function UserPage() {
  const { user: clerkUser } = useUser();
  const profile = useQuery(api.users.getCurrentUser);
  const { activeOrgId, activeOrg, memberships } = useActiveOrg();
  const orgRoles = useQuery(api.orgMemberships.getMyRoles, activeOrgId ? { orgId: activeOrgId } : "skip");

  if (profile === undefined || memberships === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  const roles = (orgRoles as AppRole[] | undefined | null) ?? [];

  const initials = (
    (clerkUser?.firstName?.[0] ?? "") + (clerkUser?.lastName?.[0] ?? "")
  ).toUpperCase() || "?";

  const fullName = clerkUser?.fullName ?? "—";

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Profile header */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={clerkUser?.imageUrl} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-semibold">{fullName}</h1>
            <p className="text-sm text-muted-foreground">
              {clerkUser?.primaryEmailAddress?.emailAddress}
            </p>
          </div>
        </div>

        <Separator />

        {/* Profile card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Profile Details</CardTitle>
            <Link href="/user/edit" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Edit
            </Link>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!profile || (!profile.phone && !profile.dateOfBirth && !profile.address) ? (
              <p className="text-muted-foreground">
                No profile details yet.{" "}
                <Link href="/user/edit" className="underline underline-offset-4">
                  Complete your profile
                </Link>
              </p>
            ) : (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3">
                {profile.phone && (
                  <>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>{profile.phone}</dd>
                  </>
                )}
                {profile.dateOfBirth && (
                  <>
                    <dt className="text-muted-foreground">Date of birth</dt>
                    <dd>{profile.dateOfBirth}</dd>
                  </>
                )}
                {profile.address && (
                  <>
                    <dt className="text-muted-foreground">Address</dt>
                    <dd>
                      {profile.address.street}, {profile.address.city},{" "}
                      {profile.address.state} {profile.address.zip}
                    </dd>
                  </>
                )}
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Permissions card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permissions</CardTitle>
            {activeOrg && <p className="text-sm text-muted-foreground">In {activeOrg.name}</p>}
          </CardHeader>
          <CardContent className="space-y-6 text-sm">
            {roles.length === 0 ? (
              <p className="text-muted-foreground">
                No role has been assigned to your account. Contact a league admin to get access.
              </p>
            ) : (
              roles.map((role, i) => {
                const roleConfig = getRoleConfig(role);
                return (
                  <div key={role} className={i > 0 ? "space-y-4 border-t pt-4" : "space-y-4"}>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">Role</span>
                      <Badge variant="secondary">{roleConfig?.label ?? role}</Badge>
                    </div>
                    {roleConfig && (
                      <>
                        <p className="text-muted-foreground">{roleConfig.description}</p>
                        <ul className="space-y-1.5">
                          {roleConfig.permissions.map((p) => (
                            <li key={p} className="flex items-center gap-2 text-muted-foreground">
                              <span className="text-foreground">✓</span>
                              {p}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
