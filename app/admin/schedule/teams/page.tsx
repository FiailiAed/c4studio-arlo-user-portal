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
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

export default function AdminTeamsPage() {
  const teams = useQuery(api.teams.listTeams);
  const createTeam = useMutation(api.teams.createTeam);
  const renameTeam = useMutation(api.teams.renameTeam);
  const deleteTeam = useMutation(api.teams.deleteTeam);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  const [pendingDelete, setPendingDelete] = useState<Doc<"teams"> | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  if (teams === undefined) {
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
      await createTeam({ name: name.trim() });
      setCreateOpen(false);
      setName("");
    } finally {
      setSubmitting(false);
    }
  }

  async function commitRename(teamId: Id<"teams">) {
    const draft = renameDrafts[teamId];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    const current = teams?.find((t) => t._id === teamId);
    if (!trimmed || trimmed === current?.name) return;
    await renameTeam({ teamId, name: trimmed });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await deleteTeam({ teamId: pendingDelete._id });
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete team");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const columns: DataTableColumn<Doc<"teams">>[] = [
    {
      key: "name",
      header: "Name",
      render: (team) => (
        <Input
          value={renameDrafts[team._id] ?? team.name}
          onChange={(e) => setRenameDrafts((prev) => ({ ...prev, [team._id]: e.target.value }))}
          onBlur={() => commitRename(team._id)}
          className="max-w-xs"
        />
      ),
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Teams</h1>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New Team
          </Button>
        </div>

        <DataTable
          columns={columns}
          rows={teams ?? []}
          getRowKey={(team) => team._id}
          emptyMessage="No teams yet."
          renderActions={(team) => (
            <Button size="sm" variant="destructive" onClick={() => { setPendingDelete(team); setDeleteError(null); }}>
              Delete
            </Button>
          )}
        />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Team</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <label className="text-sm font-medium">Team name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eagles" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete team &quot;{pendingDelete?.name}&quot;?</DialogTitle>
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
