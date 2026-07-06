"use client";

import { useMutation, useQuery } from "convex/react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getRoleConfig, hasAnyRole, type AppRole } from "@/lib/roles";
import { useActiveOrg } from "@/components/active-org-provider";
import type { Id } from "../../../convex/_generated/dataModel";

const ROLES: AppRole[] = ["family", "referee", "program_admin", "coach", "league_admin", "super_admin"];

type Member = {
  membershipId: Id<"orgMemberships">;
  clerkId: string;
  roles: string[];
  user: { firstName?: string; lastName?: string; email?: string } | null;
};

export default function AdminUsersPage() {
  const { activeOrgId, memberships } = useActiveOrg();

  if (memberships === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  if (!activeOrgId) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center py-12 px-4">
        <p className="text-sm text-muted-foreground">Select an organization above to manage its users.</p>
      </main>
    );
  }

  return <UserManagement orgId={activeOrgId} />;
}

function UserManagement({ orgId }: { orgId: Id<"organizations"> }) {
  const { user: currentUser } = useUser();
  const clerk = useClerk();
  const members = useQuery(api.orgMemberships.listMembers, { orgId });
  const myRoles = useQuery(api.orgMemberships.getMyRoles, { orgId });
  const updateRoles = useMutation(api.orgMemberships.updateRoles);
  const removeMember = useMutation(api.orgMemberships.removeMember);

  const [optimisticRoles, setOptimisticRoles] = useState<Record<string, AppRole[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [pendingRemove, setPendingRemove] = useState<{ membershipId: Id<"orgMemberships">; label: string } | null>(
    null
  );
  const [removeSubmitting, setRemoveSubmitting] = useState(false);
  const [pendingImpersonate, setPendingImpersonate] = useState<{ clerkId: string; label: string } | null>(null);
  const [impersonateSubmitting, setImpersonateSubmitting] = useState(false);

  const filteredMembers = useMemo(() => {
    if (!members) return members;
    const query = search.trim().toLowerCase();
    if (!query) return members;
    return members.filter((m) => {
      const haystack = [m.user?.firstName, m.user?.lastName, m.user?.email].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [members, search]);

  async function applyRoles(membershipId: Id<"orgMemberships">, roles: AppRole[]) {
    setOptimisticRoles((prev) => ({ ...prev, [membershipId]: roles }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[membershipId];
      return next;
    });

    try {
      await updateRoles({ membershipId, roles });
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [membershipId]: e instanceof Error ? e.message : "Failed to update roles",
      }));
      setOptimisticRoles((prev) => {
        const next = { ...prev };
        delete next[membershipId];
        return next;
      });
    }
  }

  function handleRoleToggle(membershipId: Id<"orgMemberships">, currentRoles: AppRole[], role: AppRole, checked: boolean) {
    const nextRoles = checked ? [...currentRoles, role] : currentRoles.filter((r) => r !== role);
    applyRoles(membershipId, nextRoles);
  }

  function requestRemove(membershipId: Id<"orgMemberships">, label: string) {
    setPendingRemove({ membershipId, label });
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    const { membershipId } = pendingRemove;
    setRemoveSubmitting(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[membershipId];
      return next;
    });

    try {
      await removeMember({ membershipId });
      setRemovingIds((prev) => new Set(prev).add(membershipId));
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [membershipId]: e instanceof Error ? e.message : "Failed to remove member",
      }));
    }

    setRemoveSubmitting(false);
    setPendingRemove(null);
  }

  function requestImpersonate(clerkId: string, label: string) {
    setPendingImpersonate({ clerkId, label });
  }

  async function confirmImpersonate() {
    if (!pendingImpersonate) return;
    const { clerkId } = pendingImpersonate;
    setImpersonateSubmitting(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[clerkId];
      return next;
    });

    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetClerkId: clerkId }),
    });

    if (!res.ok) {
      setErrors((prev) => ({ ...prev, [clerkId]: "Failed to start impersonation" }));
      setImpersonateSubmitting(false);
      setPendingImpersonate(null);
      return;
    }

    const { url } = await res.json();
    // Clerk won't redeem a sign-in ticket while a session is already active
    // (that requires the paid multi-session feature) — sign out first so the
    // ticket lands as a normal sign-in into the target account.
    await clerk.signOut();
    window.location.href = url;
  }

  if (members === undefined || myRoles === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  if (members === null || myRoles === null) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center py-12 px-4">
        <p className="text-sm text-muted-foreground">You don&apos;t have access to this organization&apos;s users.</p>
      </main>
    );
  }

  const visibleMembers = (filteredMembers ?? []).filter((m) => !removingIds.has(m.membershipId));

  const columns: DataTableColumn<Member>[] = [
    {
      key: "firstName",
      header: "First Name",
      render: (m) => m.user?.firstName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "lastName",
      header: "Last Name",
      render: (m) => m.user?.lastName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "email",
      header: "Email",
      render: (m) => m.user?.email ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "role",
      header: "Roles",
      render: (m) => {
        const displayRoles = (optimisticRoles[m.membershipId] ?? m.roles ?? []) as AppRole[];
        return displayRoles.length === 0 ? (
          <Badge variant="outline" className="text-muted-foreground">None</Badge>
        ) : (
          <div className="flex flex-wrap gap-1">
            {displayRoles.map((r) => (
              <Badge key={r} variant="secondary">{getRoleConfig(r)?.label ?? r}</Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: "changeRole",
      header: "Change Roles",
      render: (m) => {
        const displayRoles = (optimisticRoles[m.membershipId] ?? m.roles ?? []) as AppRole[];
        return (
          <div className="space-y-1">
            <div className="flex flex-col gap-1">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={displayRoles.includes(r)}
                    onChange={(e) => handleRoleToggle(m.membershipId, displayRoles, r, e.target.checked)}
                  />
                  {getRoleConfig(r)?.label ?? r}
                </label>
              ))}
            </div>
            {errors[m.membershipId] && <p className="text-xs text-destructive">{errors[m.membershipId]}</p>}
          </div>
        );
      },
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">User Management</h1>
          <Link href="/admin/invite" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Invite User
          </Link>
        </div>

        <Input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
          aria-label="Search users"
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Org Members {search.trim() && `(${visibleMembers.length} of ${members.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              rows={visibleMembers}
              getRowKey={(m) => m.membershipId}
              emptyMessage={search.trim() ? "No members match your search." : "No members found."}
              renderActions={(m) => (
                <div className="flex gap-2">
                  {hasAnyRole(myRoles, ["super_admin"]) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={m.clerkId === currentUser?.id}
                      onClick={() =>
                        requestImpersonate(
                          m.clerkId,
                          [m.user?.firstName, m.user?.lastName].filter(Boolean).join(" ") ||
                            m.user?.email ||
                            m.clerkId
                        )
                      }
                    >
                      Impersonate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={m.clerkId === currentUser?.id}
                    onClick={() =>
                      requestRemove(
                        m.membershipId,
                        [m.user?.firstName, m.user?.lastName].filter(Boolean).join(" ") ||
                          m.user?.email ||
                          m.clerkId
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              )}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!pendingRemove} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {pendingRemove?.label} from this organization?</DialogTitle>
            <DialogDescription>
              They&apos;ll lose access to this organization&apos;s data. Their account itself is not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemove(null)} disabled={removeSubmitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={removeSubmitting}>
              {removeSubmitting ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingImpersonate} onOpenChange={(open) => !open && setPendingImpersonate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Impersonate {pendingImpersonate?.label}?</DialogTitle>
            <DialogDescription>
              You&apos;ll be signed in as this user until you exit impersonation from the banner shown at
              the top of the app.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingImpersonate(null)} disabled={impersonateSubmitting}>
              Cancel
            </Button>
            <Button onClick={confirmImpersonate} disabled={impersonateSubmitting}>
              {impersonateSubmitting ? "Starting…" : "Impersonate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
