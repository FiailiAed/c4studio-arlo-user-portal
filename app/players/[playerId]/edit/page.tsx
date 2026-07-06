"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { PlayerForm, type PlayerFormValues } from "@/components/players/player-form";
import { useActiveOrg } from "@/components/active-org-provider";

interface EditPlayerPageProps {
  params: Promise<{ playerId: string }>;
}

export default function EditPlayerPage({ params }: EditPlayerPageProps) {
  const { playerId } = use(params);
  const router = useRouter();
  const { activeOrgId } = useActiveOrg();
  const players = useQuery(api.players.listMyPlayers, activeOrgId ? { orgId: activeOrgId } : "skip");
  const updatePlayer = useMutation(api.players.updatePlayer);

  const player = players?.find((p) => p._id === playerId);

  useEffect(() => {
    if (players !== undefined && players !== null && !player) {
      router.push("/players");
    }
  }, [players, player, router]);

  if (players === undefined || players === null || !player) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  const handleSubmit = async (values: PlayerFormValues) => {
    await updatePlayer({ playerId: playerId as Id<"players">, ...values });
    router.push("/players");
  };

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl">
        <PlayerForm
          mode="edit"
          initialValues={{
            firstName: player.firstName,
            lastName: player.lastName,
            dateOfBirth: player.dateOfBirth,
            gender: player.gender,
            school: player.school,
            grade: player.grade,
          }}
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}
