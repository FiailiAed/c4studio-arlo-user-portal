"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRoleConfig, type AppRole } from "@/lib/roles";

const ROLES: AppRole[] = ["family", "referee", "program_admin", "coach", "league_admin", "super_admin"];

type Status = "idle" | "submitting" | "success" | "error";

export default function InviteUsersPage() {
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [invitedEmail, setInvitedEmail] = useState("");

  function toggleRole(role: AppRole, checked: boolean) {
    setRoles((prev) => (checked ? [...prev, role] : prev.filter((r) => r !== role)));
    setStatus("idle");
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");

    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, roles }),
    });

    if (res.ok) {
      setStatus("success");
      setInvitedEmail(email);
      setEmail("");
      setRoles([]);
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
                <Label>Roles</Label>
                <div className="flex flex-col gap-2">
                  {ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={roles.includes(r)}
                        onChange={(e) => toggleRole(r, e.target.checked)}
                      />
                      {getRoleConfig(r)?.label ?? r}
                    </label>
                  ))}
                </div>
              </div>

              {status === "success" && (
                <p className="text-sm text-muted-foreground">Invitation sent to {invitedEmail}.</p>
              )}
              {status === "error" && <p className="text-sm text-destructive">{errorMessage}</p>}

              <Button type="submit" disabled={!email || roles.length === 0 || status === "submitting"}>
                {status === "submitting" ? "Sending…" : "Send Invite"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
