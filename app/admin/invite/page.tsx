"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRoleConfig, type AppRole } from "@/lib/roles";

const ROLES: AppRole[] = ["family", "referee", "program_admin", "league_admin", "super_admin"];

type Status = "idle" | "submitting" | "success" | "error";

export default function InviteUsersPage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole | "">("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [invitedEmail, setInvitedEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");

    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });

    if (res.ok) {
      setStatus("success");
      setInvitedEmail(email);
      setEmail("");
      setRole("");
      return;
    }

    setStatus("error");
    setErrorMessage(
      res.status === 409
        ? "This person already has a pending invitation or an account."
        : "Failed to send invitation. Try again."
    );
  };

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Invite a User</CardTitle>
            <CardDescription>Send an email invitation with a pre-assigned role.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setStatus("idle");
                  }}
                  placeholder="name@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value as AppRole);
                    setStatus("idle");
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                >
                  <option value="" disabled>Select role…</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {getRoleConfig(r)?.label ?? r}
                    </option>
                  ))}
                </select>
              </div>

              {status === "success" && (
                <p className="text-sm text-muted-foreground">Invitation sent to {invitedEmail}.</p>
              )}
              {status === "error" && <p className="text-sm text-destructive">{errorMessage}</p>}

              <Button type="submit" disabled={!email || !role || status === "submitting"}>
                {status === "submitting" ? "Sending…" : "Send Invite"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
