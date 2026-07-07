"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Button } from "@/components/ui/button";
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
import { useOrgId } from "@/lib/use-org-id";
import type { Doc } from "../../../convex/_generated/dataModel";

function toDateInputValue(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export default function AdminSeasonsPage() {
  const orgId = useOrgId();
  const seasons = useQuery(api.seasons.listSeasons, orgId ? { orgId } : "skip");
  const createSeason = useMutation(api.seasons.createSeason);
  const updateSeason = useMutation(api.seasons.updateSeason);
  const deleteSeason = useMutation(api.seasons.deleteSeason);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingSeason, setEditingSeason] = useState<Doc<"seasons"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Doc<"seasons"> | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  if (!orgId || seasons === undefined || seasons === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  function resetCreateForm() {
    setName("");
    setStartDate("");
    setEndDate("");
    setError(null);
  }

  async function handleCreate() {
    if (!orgId || !name.trim() || !startDate || !endDate) return;
    setSubmitting(true);
    setError(null);
    try {
      await createSeason({
        orgId,
        name: name.trim(),
        startDate: new Date(startDate).getTime(),
        endDate: new Date(endDate).getTime(),
      });
      setCreateOpen(false);
      resetCreateForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create season");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(season: Doc<"seasons">) {
    setEditingSeason(season);
    setEditName(season.name);
    setEditStartDate(toDateInputValue(season.startDate));
    setEditEndDate(toDateInputValue(season.endDate));
    setEditError(null);
  }

  async function handleEditSubmit() {
    if (!orgId || !editingSeason || !editName.trim() || !editStartDate || !editEndDate) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateSeason({
        orgId,
        seasonId: editingSeason._id,
        name: editName.trim(),
        startDate: new Date(editStartDate).getTime(),
        endDate: new Date(editEndDate).getTime(),
      });
      setEditingSeason(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update season");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!orgId || !pendingDelete) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await deleteSeason({ orgId, seasonId: pendingDelete._id });
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete season");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const columns: DataTableColumn<Doc<"seasons">>[] = [
    { key: "name", header: "Name", render: (s) => s.name },
    {
      key: "dates",
      header: "Dates",
      render: (s) => `${new Date(s.startDate).toLocaleDateString()} – ${new Date(s.endDate).toLocaleDateString()}`,
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Seasons</h1>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New Season
          </Button>
        </div>

        <DataTable
          columns={columns}
          rows={seasons}
          getRowKey={(s) => s._id}
          emptyMessage="No seasons yet."
          renderActions={(s) => (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                Edit
              </Button>
              <Button size="sm" variant="destructive" onClick={() => { setPendingDelete(s); setDeleteError(null); }}>
                Delete
              </Button>
            </div>
          )}
        />
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Season</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Start date</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">End date</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !name.trim() || !startDate || !endDate}>
              {submitting ? "Creating…" : "Create Season"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingSeason} onOpenChange={(open) => !open && setEditingSeason(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Season</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Start date</label>
                <Input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">End date</label>
                <Input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} />
              </div>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSeason(null)} disabled={editSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={editSubmitting || !editName.trim() || !editStartDate || !editEndDate}>
              {editSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete season &quot;{pendingDelete?.name}&quot;?</DialogTitle>
            <DialogDescription>This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
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
