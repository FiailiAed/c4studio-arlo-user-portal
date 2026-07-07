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
import { cn } from "@/lib/utils";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useActiveOrg } from "@/components/active-org-provider";

const SELECT_CLASSNAME =
  "rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

export default function AdminTeamsPage() {
  const { activeOrgId } = useActiveOrg();
  const teams = useQuery(api.teams.listTeams, activeOrgId ? { orgId: activeOrgId } : "skip");
  const clubs = useQuery(api.clubs.listClubs, activeOrgId ? { orgId: activeOrgId } : "skip");
  const orgUnits = useQuery(api.orgUnits.listOrgUnits, activeOrgId ? { orgId: activeOrgId } : "skip");
  const createTeam = useMutation(api.teams.createTeam);
  const renameTeam = useMutation(api.teams.renameTeam);
  const deleteTeam = useMutation(api.teams.deleteTeam);
  const assignTeamToClub = useMutation(api.teams.assignTeamToClub);
  const assignTeamOrgUnit = useMutation(api.teams.assignTeamOrgUnit);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [orgUnitId, setOrgUnitId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  const [pendingDelete, setPendingDelete] = useState<Doc<"teams"> | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  if (teams === undefined || clubs === undefined || orgUnits === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  async function handleCreate() {
    if (!name.trim() || !activeOrgId || !orgUnitId) return;
    setSubmitting(true);
    try {
      await createTeam({
        orgId: activeOrgId,
        name: name.trim(),
        orgUnitId: orgUnitId as Id<"orgUnits">,
      });
      setCreateOpen(false);
      setName("");
      setOrgUnitId("");
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

  async function handleClubChange(teamId: Id<"teams">, clubId: string) {
    await assignTeamToClub({ teamId, clubId: clubId ? (clubId as Id<"clubs">) : undefined });
  }

  async function handleOrgUnitChange(teamId: Id<"teams">, newOrgUnitId: string) {
    if (!newOrgUnitId) return;
    await assignTeamOrgUnit({ teamId, orgUnitId: newOrgUnitId as Id<"orgUnits"> });
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
    {
      key: "club",
      header: "Club",
      render: (team) => (
        <select
          value={team.clubId ?? ""}
          onChange={(e) => handleClubChange(team._id, e.target.value)}
          className={cn(SELECT_CLASSNAME)}
        >
          <option value="">No club</option>
          {clubs?.map((club) => (
            <option key={club._id} value={club._id}>{club.name}</option>
          ))}
        </select>
      ),
    },
    {
      key: "orgUnit",
      header: "Org Unit",
      render: (team) => (
        <select
          value={team.orgUnitId ?? ""}
          onChange={(e) => handleOrgUnitChange(team._id, e.target.value)}
          className={cn(SELECT_CLASSNAME)}
        >
          <option value="" disabled>
            Select org unit
          </option>
          {orgUnits?.map((unit) => (
            <option key={unit._id} value={unit._id}>
              {`${unit.unitType}: ${unit.name}`}
            </option>
          ))}
        </select>
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
          <div className="space-y-1">
            <label className="text-sm font-medium">Org Unit</label>
            <select
              value={orgUnitId}
              onChange={(e) => setOrgUnitId(e.target.value)}
              className={cn(SELECT_CLASSNAME, "w-full")}
            >
              <option value="">Select org unit…</option>
              {orgUnits?.map((unit) => (
                <option key={unit._id} value={unit._id}>
                  {`${unit.unitType}: ${unit.name}`}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !name.trim() || !orgUnitId}>
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
