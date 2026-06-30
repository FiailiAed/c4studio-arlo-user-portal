"use client";

import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export default function UserPage() {
  const { user: clerkUser } = useUser();
  const profile = useQuery(api.users.getCurrentUser);
  const upsertUser = useMutation(api.users.upsertUser);

  useEffect(() => {
    if (profile === null && clerkUser) {
      upsertUser({
        firstName: clerkUser.firstName ?? "",
        lastName: clerkUser.lastName ?? "",
      });
    }
  }, [profile, clerkUser, upsertUser]);

  if (profile === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  const initials = profile
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase()
    : (clerkUser?.firstName?.[0] ?? "?").toUpperCase();

  const fullName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : clerkUser?.fullName ?? "—";

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
      </div>
    </main>
  );
}
