"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Badge } from "@/components/ui/badge";
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
import type { Doc, Id } from "../../convex/_generated/dataModel";

type RosterRow = Doc<"rosters"> & { player: Doc<"players">; teamName: string };
type ScheduleRow = Doc<"games"> & {
  homeTeamName: string;
  awayTeamName: string;
  fieldName: string;
  refereeName?: string;
};

export default function CoachDashboardPage() {
  const orgId = useOrgId();
  const club = useQuery(api.coach.getMyClub, orgId ? { orgId } : "skip");
  const roster = useQuery(api.coach.getMyRoster, orgId ? { orgId } : "skip");
  const schedule = useQuery(api.coach.getMySchedule, orgId ? { orgId } : "skip");
  const verifyScore = useMutation(api.coach.verifyScore);
  const flagDispute = useMutation(api.coach.flagDispute);
  const [verifyingId, setVerifyingId] = useState<Id<"games"> | null>(null);

  const [disputingGame, setDisputingGame] = useState<ScheduleRow | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);

  if (!orgId || club === undefined || roster === undefined || schedule === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  if (club === null) {
    return (
      <main className="flex flex-1 flex-col items-center py-12 px-4">
        <p className="text-muted-foreground text-sm">
          You haven&apos;t been assigned to a club yet. Contact a league admin.
        </p>
      </main>
    );
  }

  async function handleVerify(gameId: Id<"games">) {
    if (!orgId) return;
    setVerifyingId(gameId);
    try {
      await verifyScore({ orgId, gameId });
    } finally {
      setVerifyingId(null);
    }
  }

  function openDispute(game: ScheduleRow) {
    setDisputingGame(game);
    setDisputeReason("");
    setDisputeError(null);
  }

  async function handleDispute() {
    if (!orgId || !disputingGame || !disputeReason.trim()) return;
    setDisputeSubmitting(true);
    setDisputeError(null);
    try {
      await flagDispute({ orgId, gameId: disputingGame._id, reason: disputeReason.trim() });
      setDisputingGame(null);
    } catch (e) {
      setDisputeError(e instanceof Error ? e.message : "Failed to submit dispute");
    } finally {
      setDisputeSubmitting(false);
    }
  }

  const rosterColumns: DataTableColumn<RosterRow>[] = [
    { key: "team", header: "Team", render: (r) => r.teamName },
    { key: "player", header: "Player", render: (r) => `${r.player.firstName} ${r.player.lastName}` },
    { key: "dob", header: "Date of Birth", render: (r) => r.player.dateOfBirth },
  ];

  const scheduleColumns: DataTableColumn<ScheduleRow>[] = [
    { key: "startTime", header: "Date/Time", render: (g) => new Date(g.startTime).toLocaleString() },
    { key: "matchup", header: "Matchup", render: (g) => `${g.homeTeamName} vs ${g.awayTeamName}` },
    { key: "field", header: "Field", render: (g) => g.fieldName },
    {
      key: "status",
      header: "Status",
      render: (g) =>
        g.status === "COMPLETED_WITH_SCORE" ? (
          <span className="flex items-center gap-2">
            <span>Final: {g.homeScore} - {g.awayScore}</span>
            {g.scoreVerified ? (
              <Badge variant="default">Verified</Badge>
            ) : (
              <Badge variant="outline">Needs verification</Badge>
            )}
          </span>
        ) : g.status === "DISPUTED" ? (
          <Badge variant="destructive">Disputed — awaiting admin review</Badge>
        ) : (
          <Badge variant="secondary">{g.status.replace(/_/g, " ")}</Badge>
        ),
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <h1 className="text-2xl font-semibold">{club.club.name}</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">My Roster</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={rosterColumns}
              rows={roster ?? []}
              getRowKey={(r) => r._id}
              emptyMessage="No players on your roster yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">My Schedule</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={scheduleColumns}
              rows={(schedule ?? []).slice().sort((a, b) => a.startTime - b.startTime)}
              getRowKey={(g) => g._id}
              emptyMessage="No games scheduled yet."
              renderActions={(g) =>
                g.status === "COMPLETED_WITH_SCORE" && !g.scoreVerified ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleVerify(g._id)} disabled={verifyingId === g._id}>
                      {verifyingId === g._id ? "Verifying…" : "Verify Score"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => openDispute(g)}>
                      Dispute
                    </Button>
                  </div>
                ) : null
              }
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!disputingGame} onOpenChange={(open) => !open && setDisputingGame(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Dispute Score{disputingGame ? `: ${disputingGame.homeTeamName} vs ${disputingGame.awayTeamName}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason</label>
              <Input
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="e.g. The reported score doesn't match what happened on the field."
              />
            </div>
            {disputeError && <p className="text-sm text-destructive">{disputeError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputingGame(null)} disabled={disputeSubmitting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDispute}
              disabled={disputeSubmitting || !disputeReason.trim()}
            >
              {disputeSubmitting ? "Submitting…" : "Submit Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
