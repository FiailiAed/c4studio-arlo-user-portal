"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Doc } from "../../../convex/_generated/dataModel";

/**
 * super_admin only — this is the platform-operator surface for creating new
 * tenants. There's no per-org gate here since org creation, by definition,
 * happens before any single org is "active".
 */
export default function AdminOrganizationsPage() {
  const isSuperAdmin = useQuery(api.orgMemberships.amISuperAdmin);

  if (isSuperAdmin === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center py-12 px-4">
        <p className="text-sm text-muted-foreground">
          You don&apos;t have access to platform-level organization management.
        </p>
      </main>
    );
  }

  return <OrganizationsList />;
}

function OrganizationsList() {
  const organizations = useQuery(api.organizations.listAll);
  const createOrganization = useMutation(api.organizations.create);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (organizations === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createOrganization({ name: name.trim() });
      setCreateOpen(false);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create organization");
    } finally {
      setSubmitting(false);
    }
  }

  const columns: DataTableColumn<Doc<"organizations">>[] = [
    { key: "name", header: "Name", render: (org) => org.name },
    { key: "slug", header: "Slug", render: (org) => <code className="text-xs">{org.slug}</code> },
    {
      key: "createdAt",
      header: "Created",
      render: (org) => new Date(org.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Organizations</h1>
            <p className="text-sm text-muted-foreground">All tenants on the ARLO platform.</p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New Organization
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Organizations</CardTitle>
            <CardDescription>{organizations?.length ?? 0} total</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              rows={organizations ?? []}
              getRowKey={(org) => org._id}
              emptyMessage="No organizations yet."
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <label className="text-sm font-medium">Organization name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. South Jersey Youth Lacrosse League" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
