"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
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
import { useCurrentSeason } from "@/lib/use-current-season";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type GameStatus = Doc<"games">["status"];
type GameRow = Doc<"games"> & {
  homeTeamName: string;
  awayTeamName: string;
  fieldName: string;
  refereeName?: string;
};

const SELECT_CLASSNAME =
  "rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

const STATUS_VARIANT: Record<GameStatus, "default" | "secondary" | "destructive" | "outline"> = {
  SCHEDULED: "secondary",
  PENDING_ASSIGNMENT: "outline",
  REF_ASSIGNED: "default",
  COMPLETED_WITH_SCORE: "default",
  DISPUTED: "destructive",
  CANCELLED: "destructive",
};

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminSchedulePage() {
  const orgId = useOrgId();
  const seasons = useQuery(api.seasons.listSeasons, orgId ? { orgId } : "skip");
  const currentSeason = useCurrentSeason(orgId);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const effectiveSeasonId = selectedSeasonId || currentSeason?._id;
  const games = useQuery(
    api.games.listGames,
    orgId && effectiveSeasonId ? { orgId, seasonId: effectiveSeasonId as Id<"seasons"> } : "skip"
  );
  const teams = useQuery(api.teams.listTeams, orgId ? { orgId } : "skip");
  const fields = useQuery(api.fields.listFields, orgId ? { orgId } : "skip");

  const createGame = useMutation(api.games.createGame);
  const updateGameSlot = useMutation(api.games.updateGameSlot);
  const cancelGame = useMutation(api.games.cancelGame);
  const assignReferee = useMutation(api.referees.assignReferee);

  const [createOpen, setCreateOpen] = useState(false);
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [awayTeamId, setAwayTeamId] = useState<string>("");
  const [fieldId, setFieldId] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingGame, setEditingGame] = useState<GameRow | null>(null);
  const [editFieldId, setEditFieldId] = useState<string>("");
  const [editStartTime, setEditStartTime] = useState<string>("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [pendingCancel, setPendingCancel] = useState<GameRow | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const [assigningGame, setAssigningGame] = useState<GameRow | null>(null);
  const [assignRefereeId, setAssignRefereeId] = useState<string>("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const availableRefs = useQuery(
    api.referees.getAvailableRefs,
    orgId && assigningGame ? { orgId, gameId: assigningGame._id } : "skip"
  );

  if (!orgId || seasons === undefined || seasons === null || teams === undefined || fields === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  function resetCreateForm() {
    setHomeTeamId("");
    setAwayTeamId("");
    setFieldId("");
    setStartTime("");
    setError(null);
  }

  async function handleCreate() {
    if (!orgId || !effectiveSeasonId || !homeTeamId || !awayTeamId || !fieldId || !startTime) return;
    if (homeTeamId === awayTeamId) {
      setError("Home and away team must be different");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createGame({
        orgId,
        seasonId: effectiveSeasonId as Id<"seasons">,
        homeTeamId: homeTeamId as Id<"teams">,
        awayTeamId: awayTeamId as Id<"teams">,
        fieldId: fieldId as Id<"fields">,
        startTime: new Date(startTime).getTime(),
      });
      setCreateOpen(false);
      resetCreateForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to schedule game");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(game: GameRow) {
    setEditingGame(game);
    setEditFieldId(game.fieldId);
    setEditStartTime(toDatetimeLocalValue(game.startTime));
    setEditError(null);
  }

  async function handleEditSubmit() {
    if (!orgId || !editingGame) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateGameSlot({
        orgId,
        gameId: editingGame._id,
        fieldId: editFieldId as Id<"fields">,
        startTime: new Date(editStartTime).getTime(),
      });
      setEditingGame(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update game");
    } finally {
      setEditSubmitting(false);
    }
  }

  function openAssign(game: GameRow) {
    setAssigningGame(game);
    setAssignRefereeId("");
  }

  function handleAutoAssign() {
    if (availableRefs && availableRefs.length > 0) {
      setAssignRefereeId(availableRefs[0].clerkId);
    }
  }

  async function handleAssignSubmit() {
    if (!orgId || !assigningGame || !assignRefereeId) return;
    setAssignSubmitting(true);
    try {
      await assignReferee({ orgId, gameId: assigningGame._id, refereeClerkId: assignRefereeId });
      setAssigningGame(null);
    } finally {
      setAssignSubmitting(false);
    }
  }

  async function confirmCancel() {
    if (!orgId || !pendingCancel) return;
    setCancelSubmitting(true);
    try {
      await cancelGame({ orgId, gameId: pendingCancel._id });
      setPendingCancel(null);
    } finally {
      setCancelSubmitting(false);
    }
  }

  const columns: DataTableColumn<GameRow>[] = [
    { key: "startTime", header: "Date/Time", render: (g) => new Date(g.startTime).toLocaleString() },
    { key: "field", header: "Field", render: (g) => g.fieldName },
    { key: "matchup", header: "Matchup", render: (g) => `${g.homeTeamName} vs ${g.awayTeamName}` },
    {
      key: "status",
      header: "Status",
      render: (g) => <Badge variant={STATUS_VARIANT[g.status]}>{g.status.replace(/_/g, " ")}</Badge>,
    },
    {
      key: "referee",
      header: "Referee",
      render: (g) =>
        !g.refereeId ? (
          <Badge variant="destructive">Unassigned</Badge>
        ) : g.refereeAccepted ? (
          <Badge variant="default">{g.refereeName}</Badge>
        ) : (
          <Badge variant="outline">Pending acceptance</Badge>
        ),
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Game Schedule</h1>
          <div className="flex items-center gap-2">
            {seasons.length > 0 && (
              <select
                value={effectiveSeasonId ?? ""}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                className={cn(SELECT_CLASSNAME)}
              >
                {seasons.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            )}
            <Link href="/admin/seasons" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Manage Seasons
            </Link>
            <Link href="/admin/schedule/fields" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Manage Fields
            </Link>
            <Link href="/admin/schedule/teams" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Manage Teams
            </Link>
            <Link href="/admin/schedule/bulk" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Bulk Schedule
            </Link>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={!effectiveSeasonId || teams === null || fields === null || teams.length === 0 || fields.length === 0}
            >
              New Game
            </Button>
          </div>
        </div>

        {seasons.length === 0 && (
          <p className="text-sm text-muted-foreground">
            <Link href="/admin/seasons" className="underline underline-offset-4">Create a season</Link> before
            scheduling games.
          </p>
        )}

        {(teams === null || fields === null || teams.length === 0 || fields.length === 0) && (
          <p className="text-sm text-muted-foreground">
            Add at least one team and one field before scheduling a game.
          </p>
        )}

        <DataTable
          columns={columns}
          rows={games ?? []}
          getRowKey={(g) => g._id}
          emptyMessage="No games scheduled yet."
          renderActions={(g) => (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openAssign(g)} disabled={g.status === "CANCELLED"}>
                Assign Referee
              </Button>
              <Button size="sm" variant="outline" onClick={() => openEdit(g)} disabled={g.status === "CANCELLED"}>
                Edit Slot
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setPendingCancel(g)}
                disabled={g.status === "CANCELLED"}
              >
                Cancel
              </Button>
            </div>
          )}
        />
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Game</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Home team</label>
              <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)} className={cn(SELECT_CLASSNAME, "w-full")}>
                <option value="" disabled>Select…</option>
                {teams?.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Away team</label>
              <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)} className={cn(SELECT_CLASSNAME, "w-full")}>
                <option value="" disabled>Select…</option>
                {teams?.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Field</label>
              <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} className={cn(SELECT_CLASSNAME, "w-full")}>
                <option value="" disabled>Select…</option>
                {fields?.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Start time</label>
              <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting || !homeTeamId || !awayTeamId || !fieldId || !startTime}
            >
              {submitting ? "Scheduling…" : "Schedule Game"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingGame} onOpenChange={(open) => !open && setEditingGame(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Game Slot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Field</label>
              <select value={editFieldId} onChange={(e) => setEditFieldId(e.target.value)} className={cn(SELECT_CLASSNAME, "w-full")}>
                {fields?.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Start time</label>
              <Input type="datetime-local" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGame(null)} disabled={editSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={editSubmitting}>
              {editSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assigningGame} onOpenChange={(open) => !open && setAssigningGame(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Referee</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {availableRefs === undefined ? (
              <p className="text-sm text-muted-foreground">Loading available referees…</p>
            ) : availableRefs === null || availableRefs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No conflict-free referees available for this slot.</p>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Referee</label>
                  <Button type="button" size="sm" variant="outline" onClick={handleAutoAssign}>
                    Auto-Assign
                  </Button>
                </div>
                <select
                  value={assignRefereeId}
                  onChange={(e) => setAssignRefereeId(e.target.value)}
                  className={cn(SELECT_CLASSNAME, "w-full")}
                >
                  <option value="" disabled>Select…</option>
                  {availableRefs.map((ref) => (
                    <option key={ref._id} value={ref.clerkId}>
                      {`${ref.firstName ?? ""} ${ref.lastName ?? ""}`.trim() || ref.email || ref.clerkId}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningGame(null)} disabled={assignSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleAssignSubmit} disabled={assignSubmitting || !assignRefereeId}>
              {assignSubmitting ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingCancel} onOpenChange={(open) => !open && setPendingCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this game?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCancel(null)} disabled={cancelSubmitting}>
              Back
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancelSubmitting}>
              {cancelSubmitting ? "Cancelling…" : "Cancel Game"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
