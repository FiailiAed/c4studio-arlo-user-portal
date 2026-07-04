"use client";

import { useQuery } from "convex/react";
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
import { getRoleConfig, type AppRole } from "@/lib/roles";
import type { Doc } from "../../../convex/_generated/dataModel";

const ROLES: AppRole[] = ["family", "referee", "program_admin", "league_admin", "super_admin"];

type AdminUser = Doc<"users">;

export default function AdminUsersPage() {
  const { user: currentUser } = useUser();
  const clerk = useClerk();
  const users = useQuery(api.users.listAll);
  const myProfile = useQuery(api.users.getCurrentUser);
  const myRole = myProfile?.role as AppRole | undefined;
  const [optimisticRoles, setOptimisticRoles] = useState<Record<string, AppRole>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<AppRole | "">("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [search, setSearch] = useState("");
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<{ clerkId: string; label: string } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [pendingImpersonate, setPendingImpersonate] = useState<{ clerkId: string; label: string } | null>(null);
  const [impersonateSubmitting, setImpersonateSubmitting] = useState(false);

  const filteredUsers = useMemo(() => {
    if (!users) return users;
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const haystack = [user.firstName, user.lastName, user.email].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [users, search]);

  async function applyRole(clerkIds: string[], role: AppRole) {
    setOptimisticRoles((prev) => {
      const next = { ...prev };
      for (const id of clerkIds) next[id] = role;
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      for (const id of clerkIds) delete next[id];
      return next;
    });

    const res = await fetch("/api/users/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: clerkIds, role }),
    });

    if (!res.ok) {
      setErrors((prev) => {
        const next = { ...prev };
        for (const id of clerkIds) next[id] = "Failed to update role";
        return next;
      });
      setOptimisticRoles((prev) => {
        const next = { ...prev };
        for (const id of clerkIds) delete next[id];
        return next;
      });
    }

    return res.ok;
  }

  function handleRoleChange(clerkId: string, role: AppRole) {
    applyRole([clerkId], role);
  }

  async function handleBulkApply() {
    if (!bulkRole || selected.size === 0) return;
    setBulkApplying(true);
    const ok = await applyRole(Array.from(selected), bulkRole);
    setBulkApplying(false);
    if (ok) {
      setSelected(new Set());
      setBulkRole("");
    }
  }

  function toggleSelected(clerkId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(clerkId)) next.delete(clerkId);
      else next.add(clerkId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!filteredUsers || filteredUsers.length === 0) return;
    const visibleIds = filteredUsers.filter((u) => !deletingIds.has(u.clerkId)).map((u) => u.clerkId);
    const allVisibleSelected = visibleIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function requestDelete(clerkId: string, label: string) {
    setPendingDelete({ clerkId, label });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { clerkId } = pendingDelete;
    setDeleteSubmitting(true);
    setDeletingIds((prev) => new Set(prev).add(clerkId));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[clerkId];
      return next;
    });

    const res = await fetch("/api/users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: clerkId }),
    });

    if (!res.ok) {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(clerkId);
        return next;
      });
      setErrors((prev) => ({ ...prev, [clerkId]: "Failed to delete user" }));
    }

    setDeleteSubmitting(false);
    setPendingDelete(null);
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

  if (users === undefined || users === null || filteredUsers === undefined || filteredUsers === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  const visibleUsers = filteredUsers.filter((u) => !deletingIds.has(u.clerkId));

  const columns: DataTableColumn<AdminUser>[] = [
    {
      key: "firstName",
      header: "First Name",
      render: (user) => user.firstName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "lastName",
      header: "Last Name",
      render: (user) => user.lastName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "email",
      header: "Email",
      render: (user) => user.email ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "role",
      header: "Role",
      render: (user) => {
        const displayRole = (optimisticRoles[user.clerkId] ?? user.role) as AppRole | undefined;
        const roleConfig = getRoleConfig(displayRole);
        return roleConfig ? (
          <Badge variant="secondary">{roleConfig.label}</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">None</Badge>
        );
      },
    },
    {
      key: "changeRole",
      header: "Change Role",
      render: (user) => {
        const displayRole = (optimisticRoles[user.clerkId] ?? user.role) as AppRole | undefined;
        return (
          <div className="space-y-1">
            <select
              value={displayRole ?? ""}
              onChange={(e) => handleRoleChange(user.clerkId, e.target.value as AppRole)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              <option value="" disabled>Select role…</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {getRoleConfig(r)?.label ?? r}
                </option>
              ))}
            </select>
            {errors[user.clerkId] && (
              <p className="text-xs text-destructive">{errors[user.clerkId]}</p>
            )}
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

        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <select
              value={bulkRole}
              onChange={(e) => setBulkRole(e.target.value as AppRole)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              <option value="" disabled>Select role…</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {getRoleConfig(r)?.label ?? r}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={!bulkRole || bulkApplying} onClick={handleBulkApply}>
              {bulkApplying ? "Applying…" : "Apply to selected"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              All Users {search.trim() && `(${visibleUsers.length} of ${users.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              rows={visibleUsers}
              getRowKey={(user) => user.clerkId}
              emptyMessage={search.trim() ? "No users match your search." : "No users found."}
              selection={{
                isSelected: (user) => selected.has(user.clerkId),
                onToggle: (user) => toggleSelected(user.clerkId),
                isAllSelected: visibleUsers.length > 0 && visibleUsers.every((u) => selected.has(u.clerkId)),
                onToggleAll: toggleSelectAll,
              }}
              renderActions={(user) => (
                <div className="flex gap-2">
                  {myRole === "super_admin" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={user.clerkId === currentUser?.id}
                      onClick={() =>
                        requestImpersonate(
                          user.clerkId,
                          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                            user.email ||
                            user.clerkId
                        )
                      }
                    >
                      Impersonate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={user.clerkId === currentUser?.id}
                    onClick={() =>
                      requestDelete(
                        user.clerkId,
                        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                          user.email ||
                          user.clerkId
                      )
                    }
                  >
                    Delete
                  </Button>
                </div>
              )}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.label}?</DialogTitle>
            <DialogDescription>
              This will permanently remove their account. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleteSubmitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteSubmitting}>
              {deleteSubmitting ? "Deleting…" : "Delete"}
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
