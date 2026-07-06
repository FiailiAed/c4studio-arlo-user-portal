"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import type { Doc } from "../../../convex/_generated/dataModel";

export default function AdminOrganizationsPage() {
  const organizations = useQuery(api.organizations.listAll);
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

  if (organizations === null) {
    return (
      <main className="flex flex-1 flex-col items-center py-12 px-4">
        <p className="text-muted-foreground text-sm">Only platform super admins can manage organizations.</p>
      </main>
    );
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setName("");
      // The new org appears here once its organization.created webhook lands.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create organization");
    } finally {
      setSubmitting(false);
    }
  }

  const columns: DataTableColumn<Doc<"organizations">>[] = [
    { key: "name", header: "Name", render: (org) => org.name },
    {
      key: "createdAt",
      header: "Created",
      render: (org) => new Date(org.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Organizations</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create League</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. South Jersey Youth Lacrosse League"
              className="max-w-sm"
            />
            <Button size="sm" onClick={handleCreate} disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </CardContent>
          {error && <CardContent className="pt-0 text-sm text-destructive">{error}</CardContent>}
        </Card>

        <DataTable
          columns={columns}
          rows={organizations}
          getRowKey={(org) => org._id}
          emptyMessage="No organizations yet."
        />
      </div>
    </main>
  );
}
