"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
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
import type { Doc } from "../../../../convex/_generated/dataModel";

interface FieldDraft {
  name: string;
  location: string;
}

export default function AdminFieldsPage() {
  const fields = useQuery(api.fields.listFields);
  const createField = useMutation(api.fields.createField);
  const renameField = useMutation(api.fields.renameField);
  const deleteField = useMutation(api.fields.deleteField);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editDrafts, setEditDrafts] = useState<Record<string, FieldDraft>>({});

  const [pendingDelete, setPendingDelete] = useState<Doc<"fields"> | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  if (fields === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await createField({ name: name.trim(), location: location.trim() || undefined });
      setCreateOpen(false);
      setName("");
      setLocation("");
    } finally {
      setSubmitting(false);
    }
  }

  function draftFor(field: Doc<"fields">): FieldDraft {
    return editDrafts[field._id] ?? { name: field.name, location: field.location ?? "" };
  }

  function updateDraft(field: Doc<"fields">, patch: Partial<FieldDraft>) {
    setEditDrafts((prev) => ({ ...prev, [field._id]: { ...draftFor(field), ...patch } }));
  }

  async function commitEdit(field: Doc<"fields">) {
    const draft = editDrafts[field._id];
    if (!draft) return;
    const trimmedName = draft.name.trim();
    const trimmedLocation = draft.location.trim();
    if (!trimmedName) return;
    if (trimmedName === field.name && trimmedLocation === (field.location ?? "")) return;
    await renameField({ fieldId: field._id, name: trimmedName, location: trimmedLocation || undefined });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await deleteField({ fieldId: pendingDelete._id });
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete field");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const columns: DataTableColumn<Doc<"fields">>[] = [
    {
      key: "name",
      header: "Name",
      render: (field) => (
        <Input
          value={draftFor(field).name}
          onChange={(e) => updateDraft(field, { name: e.target.value })}
          onBlur={() => commitEdit(field)}
          className="max-w-xs"
        />
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (field) => (
        <Input
          value={draftFor(field).location}
          onChange={(e) => updateDraft(field, { location: e.target.value })}
          onBlur={() => commitEdit(field)}
          placeholder="—"
          className="max-w-xs"
        />
      ),
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Fields</h1>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New Field
          </Button>
        </div>

        <DataTable
          columns={columns}
          rows={fields ?? []}
          getRowKey={(field) => field._id}
          emptyMessage="No fields yet."
          renderActions={(field) => (
            <Button size="sm" variant="destructive" onClick={() => { setPendingDelete(field); setDeleteError(null); }}>
              Delete
            </Button>
          )}
        />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Field name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Field 3" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Location (optional)</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. North Complex" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create Field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete field &quot;{pendingDelete?.name}&quot;?</DialogTitle>
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
