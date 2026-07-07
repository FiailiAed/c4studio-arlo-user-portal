"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useOrgId } from "@/lib/use-org-id";
import { buildFlatOrgUnitOptions } from "@/lib/org-units";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type MappingRow = Doc<"districtMappings"> & { orgUnitName?: string; orgUnitType?: string };

const SELECT_CLASSNAME =
  "rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

export default function AdminResidencyPage() {
  const orgId = useOrgId();
  const mappings = useQuery(api.residency.listDistrictMappings, orgId ? { orgId } : "skip");
  const unmapped = useQuery(api.residency.listUnmappedDistrictReports, orgId ? { orgId } : "skip");
  const orgUnits = useQuery(api.orgUnits.listOrgUnits, orgId ? { orgId } : "skip");
  const createMapping = useMutation(api.residency.createDistrictMapping);
  const deleteMapping = useMutation(api.residency.deleteDistrictMapping);

  const orgUnitOptions = buildFlatOrgUnitOptions(orgUnits ?? []);

  const [createOpen, setCreateOpen] = useState(false);
  const [districtName, setDistrictName] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [mappingOrgUnitId, setMappingOrgUnitId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<MappingRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  if (!orgId || mappings === undefined || unmapped === undefined || orgUnits === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  function openCreate(prefillDistrict?: string) {
    setDistrictName(prefillDistrict ?? "");
    setMunicipality("");
    setMappingOrgUnitId("");
    setError(null);
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!orgId || !districtName.trim() || !mappingOrgUnitId) return;
    setSubmitting(true);
    setError(null);
    try {
      await createMapping({
        orgId,
        districtName: districtName.trim(),
        municipality: municipality.trim() || undefined,
        orgUnitId: mappingOrgUnitId as Id<"orgUnits">,
      });
      setCreateOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create mapping");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!orgId || !pendingDelete) return;
    setDeleteSubmitting(true);
    try {
      await deleteMapping({ orgId, mappingId: pendingDelete._id });
      setPendingDelete(null);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const columns: DataTableColumn<MappingRow>[] = [
    { key: "district", header: "District", render: (m) => m.districtName },
    { key: "municipality", header: "Municipality", render: (m) => m.municipality ?? <span className="text-muted-foreground">Any</span> },
    { key: "orgUnit", header: "Mapped To", render: (m) => m.orgUnitName ?? <span className="text-muted-foreground">—</span> },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Residency Mapping</h1>
            <p className="text-sm text-muted-foreground">
              Map a school sending district to the org unit that covers it. A district with multiple
              municipalities can have separate mappings per town.
            </p>
          </div>
          <Button size="sm" onClick={() => openCreate()}>
            New Mapping
          </Button>
        </div>

        <DataTable
          columns={columns}
          rows={mappings ?? []}
          getRowKey={(m) => m._id}
          emptyMessage="No district mappings yet."
          renderActions={(m) => (
            <Button size="sm" variant="destructive" onClick={() => setPendingDelete(m)}>
              Delete
            </Button>
          )}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unmapped Districts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(unmapped ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No unmapped districts reported — families resolving their address land on a mapped org unit.
              </p>
            ) : (
              (unmapped ?? []).map((report) => (
                <div key={report._id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{report.districtName}</div>
                    {report.county && <div className="text-xs text-muted-foreground">{report.county}</div>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openCreate(report.districtName)}>
                    Map It
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New District Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">District name</label>
              <Input
                value={districtName}
                onChange={(e) => setDistrictName(e.target.value)}
                placeholder="e.g. Lenape Regional School District"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Municipality (optional)</label>
              <Input
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
                placeholder="Leave blank unless this district serves multiple towns mapped separately"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Org Unit</label>
              <select
                value={mappingOrgUnitId}
                onChange={(e) => setMappingOrgUnitId(e.target.value)}
                className={cn(SELECT_CLASSNAME, "w-full")}
              >
                <option value="" disabled>Select…</option>
                {orgUnitOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !districtName.trim() || !mappingOrgUnitId}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete mapping for &quot;{pendingDelete?.districtName}&quot;?</DialogTitle>
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
    </main>
  );
}
