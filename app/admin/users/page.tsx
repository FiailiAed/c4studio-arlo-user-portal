"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRoleConfig, type AppRole } from "@/lib/roles";

const ROLES: AppRole[] = ["family", "referee", "program_admin", "league_admin"];

export default function AdminUsersPage() {
  const users = useQuery(api.users.listAll);
  const [optimisticRoles, setOptimisticRoles] = useState<Record<string, AppRole>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleRoleChange(clerkId: string, role: AppRole) {
    setOptimisticRoles((prev) => ({ ...prev, [clerkId]: role }));
    setErrors((prev) => { const next = { ...prev }; delete next[clerkId]; return next; });

    const res = await fetch("/api/users/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: clerkId, role }),
    });

    if (!res.ok) {
      setErrors((prev) => ({ ...prev, [clerkId]: "Failed to update role" }));
      setOptimisticRoles((prev) => { const next = { ...prev }; delete next[clerkId]; return next; });
    }
  }

  if (users === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <h1 className="text-2xl font-semibold">User Management</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Users</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-6 py-3 font-medium">First Name</th>
                  <th className="px-6 py-3 font-medium">Last Name</th>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Change Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const displayRole = (optimisticRoles[user.clerkId] ?? user.role) as AppRole | undefined;
                  const roleConfig = getRoleConfig(displayRole);
                  return (
                    <tr key={user._id} className="border-b last:border-0">
                      <td className="px-6 py-3">{user.firstName ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-6 py-3">{user.lastName ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-6 py-3">{user.email ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-6 py-3">
                        {roleConfig ? (
                          <Badge variant="secondary">{roleConfig.label}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">None</Badge>
                        )}
                      </td>
                      <td className="px-6 py-3">
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
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
