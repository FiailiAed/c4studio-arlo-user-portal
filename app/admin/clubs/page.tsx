"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { useOrgId } from "@/lib/use-org-id";
import { buildFlatOrgUnitOptions } from "@/lib/org-units";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type ClubRow = Doc<"clubs"> & { coachName?: string; orgUnitName?: string; orgUnitType?: string };

const SELECT_CLASSNAME =
  "rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

export default function AdminClubsPage() {
  const orgId = useOrgId();
  const clubs = useQuery(api.clubs.listClubs, orgId ? { orgId } : "skip");
  const coaches = useQuery(api.clubs.listCoaches, orgId ? { orgId } : "skip");
  const orgUnits = useQuery(api.orgUnits.listOrgUnits, orgId ? { orgId } : "skip");
  const createClub = useMutation(api.clubs.createClub);
  const renameClub = useMutation(api.clubs.renameClub);
  const assignCoach = useMutation(api.clubs.assignCoach);
  const assignClubOrgUnit = useMutation(api.clubs.assignClubOrgUnit);
  const deleteClub = useMutation(api.clubs.deleteClub);

  const orgUnitOptions = buildFlatOrgUnitOptions(orgUnits ?? []);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [newClubOrgUnitId, setNewClubOrgUnitId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  const [assigningClub, setAssigningClub] = useState<ClubRow | null>(null);
  const [assignCoachId, setAssignCoachId] = useState<string>("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const [assigningOrgUnitClub, setAssigningOrgUnitClub] = useState<ClubRow | null>(null);
  const [assignOrgUnitId, setAssignOrgUnitId] = useState<string>("");
  const [assignOrgUnitSubmitting, setAssignOrgUnitSubmitting] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<ClubRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  if (!orgId || clubs === undefined || coaches === undefined || orgUnits === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  async function handleCreate() {
    if (!orgId || !name.trim() || !newClubOrgUnitId) return;
    setSubmitting(true);
    try {
      await createClub({ orgId, name: name.trim(), orgUnitId: newClubOrgUnitId as Id<"orgUnits"> });
      setCreateOpen(false);
      setName("");
      setNewClubOrgUnitId("");
    } finally {
      setSubmitting(false);
    }
  }

  async function commitRename(clubId: Id<"clubs">) {
    if (!orgId) return;
    const draft = renameDrafts[clubId];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    const current = clubs?.find((c) => c._id === clubId);
    if (!trimmed || trimmed === current?.name) return;
    await renameClub({ orgId, clubId, name: trimmed });
  }

  function openAssign(club: ClubRow) {
    setAssigningClub(club);
    setAssignCoachId(club.coachClerkId ?? "");
  }

  async function handleAssignSubmit() {
    if (!orgId || !assigningClub) return;
    setAssignSubmitting(true);
    try {
      await assignCoach({ orgId, clubId: assigningClub._id, coachClerkId: assignCoachId || undefined });
      setAssigningClub(null);
    } finally {
      setAssignSubmitting(false);
    }
  }

  function openAssignOrgUnit(club: ClubRow) {
    setAssigningOrgUnitClub(club);
    setAssignOrgUnitId(club.orgUnitId ?? "");
  }

  async function handleAssignOrgUnitSubmit() {
    if (!orgId || !assigningOrgUnitClub || !assignOrgUnitId) return;
    setAssignOrgUnitSubmitting(true);
    try {
      await assignClubOrgUnit({
        orgId,
        clubId: assigningOrgUnitClub._id,
        orgUnitId: assignOrgUnitId as Id<"orgUnits">,
      });
      setAssigningOrgUnitClub(null);
    } finally {
      setAssignOrgUnitSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!orgId || !pendingDelete) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await deleteClub({ orgId, clubId: pendingDelete._id });
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete club");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const columns: DataTableColumn<ClubRow>[] = [
    {
      key: "name",
      header: "Name",
      render: (club) => (
        <Input
          value={renameDrafts[club._id] ?? club.name}
          onChange={(e) => setRenameDrafts((prev) => ({ ...prev, [club._id]: e.target.value }))}
          onBlur={() => commitRename(club._id)}
          className="max-w-xs"
        />
      ),
    },
    {
      key: "coach",
      header: "Coach",
      render: (club) =>
        club.coachName ? (
          <Badge variant="secondary">{club.coachName}</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">Unassigned</Badge>
        ),
    },
    {
      key: "orgUnit",
      header: "Org Unit",
      render: (club) =>
        club.orgUnitName ? (
          <Badge variant="secondary">{club.orgUnitName}</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">Unassigned</Badge>
        ),
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Clubs</h1>
          <div className="flex gap-2">
            <Link href="/admin/schedule/teams" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Manage Teams
            </Link>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              New Club
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={clubs ?? []}
          getRowKey={(club) => club._id}
          emptyMessage="No clubs yet."
          renderActions={(club) => (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openAssign(club)}>
                Assign Coach
              </Button>
              <Button size="sm" variant="outline" onClick={() => openAssignOrgUnit(club)}>
                Assign Org Unit
              </Button>
              <Link
                href={`/admin/clubs/${club._id}/roster`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Manage Roster
              </Link>
              <Button size="sm" variant="destructive" onClick={() => { setPendingDelete(club); setDeleteError(null); }}>
                Delete
              </Button>
            </div>
          )}
        />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Club</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <label className="text-sm font-medium">Club name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riverside Youth Lacrosse" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Org Unit</label>
            <select
              value={newClubOrgUnitId}
              onChange={(e) => setNewClubOrgUnitId(e.target.value)}
              className={cn(SELECT_CLASSNAME, "w-full")}
            >
              <option value="" disabled>Select…</option>
              {orgUnitOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {orgUnitOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No org units yet — create one on the{" "}
                <Link href="/admin/org-units" className="underline underline-offset-4">Org Structure</Link> page first.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !name.trim() || !newClubOrgUnitId}>
              {submitting ? "Creating…" : "Create Club"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assigningOrgUnitClub} onOpenChange={(open) => !open && setAssigningOrgUnitClub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Org Unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {orgUnitOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No org units yet.</p>
            ) : (
              <select
                value={assignOrgUnitId}
                onChange={(e) => setAssignOrgUnitId(e.target.value)}
                className={cn(SELECT_CLASSNAME, "w-full")}
              >
                <option value="" disabled>Select…</option>
                {orgUnitOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningOrgUnitClub(null)} disabled={assignOrgUnitSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleAssignOrgUnitSubmit} disabled={assignOrgUnitSubmitting || !assignOrgUnitId}>
              {assignOrgUnitSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assigningClub} onOpenChange={(open) => !open && setAssigningClub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Coach</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {coaches === null || coaches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users with the coach role yet.</p>
            ) : (
              <select
                value={assignCoachId}
                onChange={(e) => setAssignCoachId(e.target.value)}
                className={cn(SELECT_CLASSNAME, "w-full")}
              >
                <option value="">Unassigned</option>
                {coaches.map((coach) => (
                  <option key={coach._id} value={coach.clerkId}>
                    {`${coach.firstName ?? ""} ${coach.lastName ?? ""}`.trim() || coach.email || coach.clerkId}
                  </option>
                ))}
              </select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningClub(null)} disabled={assignSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleAssignSubmit} disabled={assignSubmitting}>
              {assignSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete club &quot;{pendingDelete?.name}&quot;?</DialogTitle>
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
