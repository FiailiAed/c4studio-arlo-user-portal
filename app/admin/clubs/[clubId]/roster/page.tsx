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
import { useOrgId } from "@/lib/use-org-id";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

type RosterRow = Doc<"rosters"> & { player: Doc<"players"> };

function playerLabel(player: Doc<"players">) {
  return `${player.firstName} ${player.lastName}`;
}

function TeamRosterSection({ orgId, team }: { orgId: string; team: Doc<"teams"> }) {
  const roster = useQuery(api.rosters.listRosterForTeam, { orgId, teamId: team._id });
  const allPlayers = useQuery(api.players.listAllPlayers, { orgId });
  const addToRoster = useMutation(api.rosters.addToRoster);
  const removeFromRoster = useMutation(api.rosters.removeFromRoster);

  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rosteredPlayerIds = new Set((roster ?? []).map((r) => r.playerId));
  const query = search.trim().toLowerCase();
  const candidates = (allPlayers ?? []).filter(
    (p) => !rosteredPlayerIds.has(p._id) && (!query || playerLabel(p).toLowerCase().includes(query))
  );

  async function handleAdd(playerId: Id<"players">) {
    setAddSubmitting(true);
    setError(null);
    try {
      await addToRoster({ orgId, teamId: team._id, playerId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add player");
    } finally {
      setAddSubmitting(false);
    }
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
            <Button size="sm" variant="destructive" onClick={() => removeFromRoster({ orgId, rosterId: r._id })}>
              Remove
            </Button>
          )}
        />
      </CardContent>

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setSearch(""); setError(null); } }}>
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
  const orgId = useOrgId();

  const result = useQuery(api.clubs.getClub, orgId ? { orgId, clubId: id } : "skip");

  if (!orgId || result === undefined) {
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
          teams.map((team) => <TeamRosterSection key={team._id} orgId={orgId} team={team} />)
        )}
      </div>
    </main>
  );
}
