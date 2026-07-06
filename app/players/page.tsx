"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useActiveOrg } from "@/components/active-org-provider";

export default function PlayersPage() {
  const { activeOrgId } = useActiveOrg();
  const players = useQuery(api.players.listMyPlayers, activeOrgId ? { orgId: activeOrgId } : "skip");
  const deletePlayer = useMutation(api.players.deletePlayer);
  const [pendingDelete, setPendingDelete] = useState<{ id: Id<"players">; label: string } | null>(
    null
  );
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSubmitting(true);
    try {
      await deletePlayer({ playerId: pendingDelete.id });
      setPendingDelete(null);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  if (players === undefined || players === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">My Players</h1>
          <Link href="/players/new" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Add Player
          </Link>
        </div>

        {players.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-muted-foreground">You haven&apos;t added any players yet.</p>
              <Link href="/players/new" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Add Player
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {players.map((player) => (
              <Card key={player._id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {player.firstName} {player.lastName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">DOB: {player.dateOfBirth}</p>
                  {(player.school || player.grade) && (
                    <p className="text-sm text-muted-foreground">
                      {[player.school, player.grade ? `Grade ${player.grade}` : undefined]
                        .filter(Boolean)
                        .join(" — ")}
                    </p>
                  )}
                  <div className="flex gap-3 pt-2">
                    <Link
                      href={`/players/${player._id}/edit`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      Edit
                    </Link>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setPendingDelete({
                          id: player._id,
                          label: `${player.firstName} ${player.lastName}`,
                        })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.label}?</DialogTitle>
            <DialogDescription>
              This will permanently remove this player&apos;s profile. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
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
