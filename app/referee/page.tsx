"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type GameRow = Doc<"games"> & { homeTeamName: string; awayTeamName: string; fieldName: string };

function PayoutAccountCard() {
  const orgId = useOrgId();
  const account = useQuery(api.financials.getMyPayoutAccount, orgId ? { orgId } : "skip");
  const startOnboarding = useAction(api.financialsActions.startOnboarding);
  const refreshMyPayoutStatus = useAction(api.financialsActions.refreshMyPayoutStatus);
  const createExpressDashboardLink = useAction(api.financialsActions.createExpressDashboardLink);
  const [connecting, setConnecting] = useState(false);
  const [openingDashboard, setOpeningDashboard] = useState(false);

  useEffect(() => {
    if (orgId && account?.stripeConnectId) {
      refreshMyPayoutStatus({ orgId });
    }
    // Only refresh once per mount (e.g. right after returning from Stripe onboarding).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.stripeConnectId, orgId]);

  if (!orgId || account === undefined) return null;

  async function handleConnect() {
    if (!orgId) return;
    setConnecting(true);
    try {
      const { url } = await startOnboarding({ orgId, returnUrl: `${window.location.origin}/referee` });
      window.location.href = url;
    } finally {
      setConnecting(false);
    }
  }

  async function handleOpenDashboard() {
    if (!orgId) return;
    setOpeningDashboard(true);
    try {
      const { url } = await createExpressDashboardLink({ orgId });
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setOpeningDashboard(false);
    }
  }

  const status = !account?.stripeConnectId
    ? "not_connected"
    : account.transfersActive
      ? "active"
      : "incomplete";

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">Payout Account</CardTitle>
        {status === "active" && <Badge variant="default">Active</Badge>}
        {status === "incomplete" && <Badge variant="outline">Onboarding incomplete</Badge>}
        {status === "not_connected" && <Badge variant="destructive">Not connected</Badge>}
      </CardHeader>
      <CardContent className="space-y-2">
        {status !== "active" && (
          <Button className="w-full" onClick={handleConnect} disabled={connecting}>
            {connecting ? "Redirecting…" : status === "incomplete" ? "Continue Onboarding" : "Connect Stripe Account"}
          </Button>
        )}
        {account?.stripeConnectId && (
          <Button
            className="w-full"
            variant="outline"
            onClick={handleOpenDashboard}
            disabled={openingDashboard}
          >
            {openingDashboard ? "Opening…" : "View Payout Dashboard"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

type PayoutHistoryRow = Doc<"payoutLedger"> & { gameMatchup: string; gameStartTime?: number };

function PayoutHistoryCard() {
  const orgId = useOrgId();
  const history = useQuery(api.financials.getMyPayoutHistory, orgId ? { orgId } : "skip");

  if (!history || history.length === 0) return null;

  const sorted = (history as PayoutHistoryRow[])
    .slice()
    .sort((a, b) => (b.gameStartTime ?? 0) - (a.gameStartTime ?? 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payout History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map((entry) => (
          <div key={entry._id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <div>
              <div>{entry.gameMatchup}</div>
              {entry.gameStartTime && (
                <div className="text-xs text-muted-foreground">{new Date(entry.gameStartTime).toLocaleDateString()}</div>
              )}
            </div>
            <div className="text-right">
              <div>${(entry.netAmountCents / 100).toFixed(2)}</div>
              {entry.status === "PAID" && <Badge variant="default">Paid</Badge>}
              {entry.status === "PENDING" && <Badge variant="outline">Pending</Badge>}
              {entry.status === "FAILED" && <Badge variant="destructive">Failed</Badge>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function RefereeDashboardPage() {
  const orgId = useOrgId();
  const games = useQuery(api.games.listMyAssignedGames, orgId ? { orgId } : "skip");
  const acceptGame = useMutation(api.games.acceptGame);
  const submitScore = useMutation(api.games.submitScore);
  const [acceptingId, setAcceptingId] = useState<Id<"games"> | null>(null);

  const [scoringGame, setScoringGame] = useState<GameRow | null>(null);
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [scoreSubmitting, setScoreSubmitting] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  if (!orgId || games === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  const upcoming = (games ?? [])
    .filter((g) => g.status !== "CANCELLED")
    .sort((a, b) => a.startTime - b.startTime);

  async function handleAccept(gameId: Id<"games">) {
    if (!orgId) return;
    setAcceptingId(gameId);
    try {
      await acceptGame({ orgId, gameId });
    } finally {
      setAcceptingId(null);
    }
  }

  function openScoreDialog(game: GameRow) {
    setScoringGame(game);
    setHomeScore("");
    setAwayScore("");
    setScoreError(null);
  }

  async function handleSubmitScore() {
    if (!orgId || !scoringGame || homeScore === "" || awayScore === "") return;
    setScoreSubmitting(true);
    setScoreError(null);
    try {
      await submitScore({
        orgId,
        gameId: scoringGame._id,
        homeScore: Number(homeScore),
        awayScore: Number(awayScore),
      });
      setScoringGame(null);
    } catch (e) {
      setScoreError(e instanceof Error ? e.message : "Failed to submit score");
    } finally {
      setScoreSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center py-8 px-4">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">My Games</h1>

        <PayoutAccountCard />
        <PayoutHistoryCard />

        {upcoming.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              No upcoming game assignments.
            </CardContent>
          </Card>
        )}

        {upcoming.map((g) => (
          <Card key={g._id}>
            <CardHeader className="space-y-2">
              <CardTitle className="text-base">
                {g.homeTeamName} vs {g.awayTeamName}
              </CardTitle>
              <div className="text-sm text-muted-foreground">
                {new Date(g.startTime).toLocaleString()} · {g.fieldName}
              </div>
              {g.refereeAccepted ? (
                <Badge variant="default">Accepted</Badge>
              ) : (
                <Badge variant="outline">Awaiting your acceptance</Badge>
              )}
            </CardHeader>
            {!g.refereeAccepted && (
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => handleAccept(g._id)}
                  disabled={acceptingId === g._id}
                >
                  {acceptingId === g._id ? "Accepting…" : "Accept"}
                </Button>
              </CardContent>
            )}
            {g.status === "REF_ASSIGNED" && (
              <CardContent>
                <Button className="w-full" onClick={() => openScoreDialog(g)}>
                  Submit Score
                </Button>
              </CardContent>
            )}
            {g.status === "COMPLETED_WITH_SCORE" && (
              <CardContent className="text-sm text-muted-foreground">
                Final: {g.homeScore} - {g.awayScore}
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={!!scoringGame} onOpenChange={(open) => !open && setScoringGame(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Submit Score{scoringGame ? `: ${scoringGame.homeTeamName} vs ${scoringGame.awayTeamName}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">{scoringGame?.homeTeamName ?? "Home"}</label>
              <Input type="number" min={0} value={homeScore} onChange={(e) => setHomeScore(e.target.value)} />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">{scoringGame?.awayTeamName ?? "Away"}</label>
              <Input type="number" min={0} value={awayScore} onChange={(e) => setAwayScore(e.target.value)} />
            </div>
          </div>
          {scoreError && <p className="text-sm text-destructive">{scoreError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoringGame(null)} disabled={scoreSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitScore} disabled={scoreSubmitting || homeScore === "" || awayScore === ""}>
              {scoreSubmitting ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
