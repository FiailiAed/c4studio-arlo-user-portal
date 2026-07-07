"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { useActiveOrg } from "@/components/active-org-provider";
import { cn } from "@/lib/utils";
import { hasAnyRole } from "@/lib/roles";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

const SELECT_CLASSNAME =
  "rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

type Mapping = Doc<"districtMappings">;
type UnmappedReport = Doc<"unmappedDistrictReports">;

/**
 * league_admin-gated: SJYLAX's residency rule needs somewhere for admins to
 * (a) maintain the district -> org-unit mapping table and (b) triage the
 * reports that get logged whenever a roster add hits an unmapped district.
 */
export default function AdminResidencyPage() {
  const { activeOrgId, activeOrg, memberships } = useActiveOrg();

  if (memberships === undefined || (activeOrgId && memberships.length > 0 && !activeOrg)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  if (!activeOrgId) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center py-12 px-4">
        <p className="text-sm text-muted-foreground">
          Select an organization above to manage residency mappings.
        </p>
      </main>
    );
  }

  return <ResidencyGate orgId={activeOrgId} />;
}

/**
 * Gate on the caller's own role before ever calling the league_admin-gated
 * residency queries — those throw "Forbidden" for non-admins (rather than
 * returning null), which would otherwise leave useQuery stuck in a
 * permanent error state (same pattern as app/admin/org-units/page.tsx).
 */
function ResidencyGate({ orgId }: { orgId: Id<"organizations"> }) {
  const myRoles = useQuery(api.orgMemberships.getMyRoles, { orgId });

  if (myRoles === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  if (!hasAnyRole(myRoles ?? undefined, ["league_admin", "super_admin"])) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center py-12 px-4">
        <p className="text-sm text-muted-foreground">You don&apos;t have access to this organization&apos;s settings.</p>
      </main>
    );
  }

  return <ResidencyManager orgId={orgId} />;
}

function ResidencyManager({ orgId }: { orgId: Id<"organizations"> }) {
  const mappings = useQuery(api.districtMappings.listMappings, { orgId });
  const orgUnits = useQuery(api.orgUnits.listOrgUnits, { orgId });
  const reports = useQuery(api.residency.listUnmappedReports, { orgId });
  const members = useQuery(api.orgMemberships.listMembers, { orgId });

  const upsertMapping = useMutation(api.districtMappings.upsertMapping);
  const deleteMapping = useMutation(api.districtMappings.deleteMapping);
  const resolveUnmappedReport = useMutation(api.residency.resolveUnmappedReport);

  const formRef = useRef<HTMLDivElement>(null);
  const [editingMappingId, setEditingMappingId] = useState<Id<"districtMappings"> | null>(null);
  const [districtName, setDistrictName] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [orgUnitId, setOrgUnitId] = useState<string>("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Mapping | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [dismissingId, setDismissingId] = useState<Id<"unmappedDistrictReports"> | null>(null);
  const [dismissError, setDismissError] = useState<string | null>(null);

  const orgUnitNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const unit of orgUnits ?? []) map.set(unit._id, `${unit.unitType}: ${unit.name}`);
    return map;
  }, [orgUnits]);

  const memberNameByClerkId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members ?? []) {
      const label = [m.user?.firstName, m.user?.lastName].filter(Boolean).join(" ") || m.user?.email || m.clerkId;
      map.set(m.clerkId, label);
    }
    return map;
  }, [members]);

  if (
    mappings === undefined ||
    orgUnits === undefined ||
    reports === undefined ||
    members === undefined
  ) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  if (mappings === null || orgUnits === null || reports === null || members === null) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center py-12 px-4">
        <p className="text-sm text-muted-foreground">You don&apos;t have access to this organization.</p>
      </main>
    );
  }

  function resetForm() {
    setEditingMappingId(null);
    setDistrictName("");
    setMunicipality("");
    setOrgUnitId("");
    setFormError(null);
  }

  function startEdit(mapping: Mapping) {
    setEditingMappingId(mapping._id);
    setDistrictName(mapping.districtName);
    setMunicipality(mapping.municipality ?? "");
    setOrgUnitId(mapping.orgUnitId);
    setFormError(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function prefillFromReport(report: UnmappedReport) {
    setEditingMappingId(null);
    setDistrictName(report.districtName);
    setMunicipality("");
    setOrgUnitId("");
    setFormError(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit() {
    if (!districtName.trim() || !orgUnitId) return;
    setFormSubmitting(true);
    setFormError(null);
    try {
      await upsertMapping({
        orgId,
        districtName: districtName.trim(),
        municipality: municipality.trim() || undefined,
        orgUnitId: orgUnitId as Id<"orgUnits">,
      });
      resetForm();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save mapping");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteMapping({ mappingId: pendingDelete._id });
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete mapping");
    }
  }

  async function handleDismiss(report: UnmappedReport) {
    setDismissingId(report._id);
    setDismissError(null);
    try {
      await resolveUnmappedReport({ reportId: report._id });
    } catch (e) {
      setDismissError(e instanceof Error ? e.message : "Failed to dismiss report");
    } finally {
      setDismissingId(null);
    }
  }

  const mappingColumns: DataTableColumn<Mapping>[] = [
    { key: "districtName", header: "District", render: (m) => m.districtName },
    { key: "municipality", header: "Municipality", render: (m) => m.municipality ?? "—" },
    { key: "orgUnit", header: "Mapped Org Unit", render: (m) => orgUnitNameById.get(m.orgUnitId) ?? m.orgUnitId },
  ];

  const reportColumns: DataTableColumn<UnmappedReport>[] = [
    {
      key: "guardian",
      header: "Guardian",
      render: (r) => memberNameByClerkId.get(r.guardianClerkId) ?? r.guardianClerkId,
    },
    { key: "districtName", header: "District", render: (r) => r.districtName },
    { key: "county", header: "County", render: (r) => r.county ?? "—" },
    { key: "reportedAt", header: "Reported", render: (r) => new Date(r.reportedAt).toLocaleDateString() },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Residency</h1>
          <p className="text-sm text-muted-foreground">
            Map school districts to org units and review unresolved reports.
          </p>
        </div>

        <Card>
          <div ref={formRef} />
          <CardHeader>
            <CardTitle className="text-base">District mappings</CardTitle>
            <CardDescription>
              Every district a family can resolve to should map to the org unit that covers it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium">District name</label>
                <Input
                  value={districtName}
                  onChange={(e) => setDistrictName(e.target.value)}
                  placeholder="e.g. Cherry Hill Public Schools"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Municipality (optional)</label>
                <Input
                  value={municipality}
                  onChange={(e) => setMunicipality(e.target.value)}
                  placeholder="e.g. Cherry Hill"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Org unit</label>
                <select
                  value={orgUnitId}
                  onChange={(e) => setOrgUnitId(e.target.value)}
                  className={cn(SELECT_CLASSNAME, "w-full")}
                >
                  <option value="">Select an org unit…</option>
                  {orgUnits.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.unitType}: {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={formSubmitting || !districtName.trim() || !orgUnitId}
                >
                  {formSubmitting ? "Saving…" : editingMappingId ? "Update" : "Add"}
                </Button>
                {editingMappingId && (
                  <Button size="sm" variant="outline" onClick={resetForm} disabled={formSubmitting}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DataTable
              columns={mappingColumns}
              rows={mappings}
              getRowKey={(m) => m._id}
              emptyMessage="No district mappings yet."
              renderActions={(m) => (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(m)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setPendingDelete(m);
                      setDeleteError(null);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            />
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unmapped district reports</CardTitle>
            <CardDescription>
              Logged whenever a roster add is blocked because a guardian&apos;s resolved district has no mapping.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataTable
              columns={reportColumns}
              rows={reports}
              getRowKey={(r) => r._id}
              emptyMessage="No unresolved reports."
              renderActions={(r) => (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => prefillFromReport(r)}>
                    Create mapping
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={dismissingId === r._id}
                    onClick={() => handleDismiss(r)}
                  >
                    {dismissingId === r._id ? "Dismissing…" : "Dismiss"}
                  </Button>
                </div>
              )}
            />
            {dismissError && <p className="text-sm text-destructive">{dismissError}</p>}
          </CardContent>
        </Card>
      </div>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-sm space-y-4 rounded-md border bg-background p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">
              Delete mapping for &quot;{pendingDelete.districtName}&quot;?
            </h2>
            <p className="text-sm text-muted-foreground">This can&apos;t be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
