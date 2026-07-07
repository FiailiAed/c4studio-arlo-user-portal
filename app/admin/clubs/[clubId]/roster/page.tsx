"use client";

import { useMutation, useQuery } from "convex/react";
import { use, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
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
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { useActiveOrg } from "@/components/active-org-provider";

type RosterRow = Doc<"rosters"> & { player: Doc<"players"> };

function playerLabel(player: Doc<"players">) {
  return `${player.firstName} ${player.lastName}`;
}

const RESIDENCY_ERROR_MESSAGES: Record<string, string> = {
  DISTRICT_NOT_RESOLVED:
    "This player's family hasn't resolved their school district yet. Ask them to do so from their profile page before adding them to a roster.",
  DISTRICT_UNMAPPED:
    "This player's resolved district isn't mapped to an org unit yet. Map it under Admin → Residency, or override below.",
  DISTRICT_MISMATCH:
    "This player's resolved district maps to a different org unit than this team. Override below if this is intentional.",
};

function TeamRosterSection({ team }: { team: Doc<"teams"> }) {
  const { activeOrgId } = useActiveOrg();
  const roster = useQuery(api.rosters.listRosterForTeam, { teamId: team._id });
  const allPlayers = useQuery(
    api.players.listAllPlayers,
    activeOrgId ? { orgId: activeOrgId } : "skip"
  );
  const addToRoster = useMutation(api.rosters.addToRoster);
  const removeFromRoster = useMutation(api.rosters.removeFromRoster);

  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overridePlayerId, setOverridePlayerId] = useState<Id<"players"> | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const rosteredPlayerIds = new Set((roster ?? []).map((r) => r.playerId));
  const query = search.trim().toLowerCase();
  const candidates = (allPlayers ?? []).filter(
    (p) => !rosteredPlayerIds.has(p._id) && (!query || playerLabel(p).toLowerCase().includes(query))
  );

  function resetAddState() {
    setError(null);
    setOverridePlayerId(null);
    setOverrideReason("");
  }

  async function handleAdd(playerId: Id<"players">, overrideReasonForThisAdd?: string) {
    setAddSubmitting(true);
    setError(null);
    try {
      await addToRoster({
        teamId: team._id,
        playerId,
        overrideReason: overrideReasonForThisAdd,
      });
      setOverridePlayerId(null);
      setOverrideReason("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to add player";
      const residencyMessage = RESIDENCY_ERROR_MESSAGES[message];
      if (residencyMessage) {
        setError(residencyMessage);
        // Only unresolved-district has no override path — nothing exists yet
        // to override. Unmapped/mismatch both allow a league_admin override.
        setOverridePlayerId(message === "DISTRICT_NOT_RESOLVED" ? null : playerId);
      } else {
        setError(message);
        setOverridePlayerId(null);
      }
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleOverrideAdd() {
    if (!overridePlayerId || !overrideReason.trim()) return;
    await handleAdd(overridePlayerId, overrideReason.trim());
  }

  const columns: DataTableColumn<RosterRow>[] = [
    { key: "name", header: "Player", render: (r) => playerLabel(r.player) },
    { key: "dob", header: "Date of Birth", render: (r) => r.player.dateOfBirth },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{team.name}</CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          Add Player
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          columns={columns}
          rows={roster ?? []}
          getRowKey={(r) => r._id}
          emptyMessage="No players on this roster yet."
          renderActions={(r) => (
            <Button size="sm" variant="destructive" onClick={() => removeFromRoster({ rosterId: r._id })}>
              Remove
            </Button>
          )}
        />
      </CardContent>

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setSearch(""); resetAddState(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Player to {team.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="search"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matching players.</p>
              ) : (
                candidates.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    disabled={addSubmitting}
                    onClick={() => handleAdd(p._id)}
                    className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50 disabled:opacity-50"
                  >
                    <span>{playerLabel(p)}</span>
                    <span className="text-muted-foreground">{p.dateOfBirth}</span>
                  </button>
                ))
              )}
            </div>
            {overridePlayerId && (
              <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
                <p className="text-sm font-medium">Override reason required</p>
                <Input
                  placeholder="Reason for override…"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={addSubmitting || !overrideReason.trim()}
                  onClick={handleOverrideAdd}
                >
                  {addSubmitting ? "Adding…" : "Override & Add"}
                </Button>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function AdminClubRosterPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = use(params);
  const id = clubId as Id<"clubs">;
  const { activeOrgId } = useActiveOrg();

  const result = useQuery(
    api.clubs.getClub,
    activeOrgId ? { orgId: activeOrgId, clubId: id } : "skip"
  );

  if (result === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  if (result === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Club not found.</p>
      </div>
    );
  }

  const { club, teams } = result;

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <h1 className="text-2xl font-semibold">{club.name} — Rosters</h1>

        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This club has no teams yet. Assign a team to this club from Manage Teams first.
          </p>
        ) : (
          teams.map((team) => <TeamRosterSection key={team._id} team={team} />)
        )}
      </div>
    </main>
  );
}
