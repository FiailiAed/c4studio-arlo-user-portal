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
import type { Doc } from "../../../convex/_generated/dataModel";

type DisputeRow = Doc<"disputes"> & {
  gameMatchup: string;
  gameStartTime?: number;
  currentHomeScore?: number;
  currentAwayScore?: number;
  raisedByName: string;
};

export default function AdminExceptionsPage() {
  const disputes = useQuery(api.disputes.listOpenDisputes);
  const resolveDispute = useMutation(api.disputes.resolveDispute);

  const [resolvingDispute, setResolvingDispute] = useState<DisputeRow | null>(null);
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disputes === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  function openResolve(dispute: DisputeRow) {
    setResolvingDispute(dispute);
    setHomeScore(dispute.currentHomeScore !== undefined ? String(dispute.currentHomeScore) : "");
    setAwayScore(dispute.currentAwayScore !== undefined ? String(dispute.currentAwayScore) : "");
    setNotes("");
    setError(null);
  }

  async function handleResolve() {
    if (!resolvingDispute || !notes.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await resolveDispute({
        disputeId: resolvingDispute._id,
        resolutionNotes: notes.trim(),
        homeScore: homeScore === "" ? undefined : Number(homeScore),
        awayScore: awayScore === "" ? undefined : Number(awayScore),
      });
      setResolvingDispute(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve dispute");
    } finally {
      setSubmitting(false);
    }
  }

  const columns: DataTableColumn<DisputeRow>[] = [
    {
      key: "game",
      header: "Game",
      render: (d) => (
        <div>
          <div>{d.gameMatchup}</div>
          {d.gameStartTime && (
            <div className="text-xs text-muted-foreground">{new Date(d.gameStartTime).toLocaleString()}</div>
          )}
        </div>
      ),
    },
    {
      key: "score",
      header: "Current Score",
      render: (d) =>
        d.currentHomeScore !== undefined && d.currentAwayScore !== undefined
          ? `${d.currentHomeScore} - ${d.currentAwayScore}`
          : "—",
    },
    { key: "coach", header: "Raised By", render: (d) => d.raisedByName },
    { key: "reason", header: "Reason", render: (d) => d.reason },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-5xl space-y-6">
        <h1 className="text-2xl font-semibold">Exceptions</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open Disputes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              rows={(disputes as DisputeRow[]) ?? []}
              getRowKey={(d) => d._id}
              emptyMessage="No open disputes."
              renderActions={(d) => (
                <Button size="sm" onClick={() => openResolve(d)}>
                  Resolve
                </Button>
              )}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!resolvingDispute} onOpenChange={(open) => !open && setResolvingDispute(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Dispute{resolvingDispute ? `: ${resolvingDispute.gameMatchup}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{resolvingDispute?.reason}</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">Home Score</label>
                <Input type="number" min={0} value={homeScore} onChange={(e) => setHomeScore(e.target.value)} />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">Away Score</label>
                <Input type="number" min={0} value={awayScore} onChange={(e) => setAwayScore(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Resolution Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Verified with both coaches, corrected final score." />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolvingDispute(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={submitting || !notes.trim()}>
              {submitting ? "Resolving…" : "Resolve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
