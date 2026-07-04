"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Id } from "../../convex/_generated/dataModel";

export default function RefereeDashboardPage() {
  const games = useQuery(api.games.listMyAssignedGames);
  const acceptGame = useMutation(api.games.acceptGame);
  const [acceptingId, setAcceptingId] = useState<Id<"games"> | null>(null);

  if (games === undefined) {
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
    setAcceptingId(gameId);
    try {
      await acceptGame({ gameId });
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center py-8 px-4">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">My Games</h1>

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
          </Card>
        ))}
      </div>
    </main>
  );
}
