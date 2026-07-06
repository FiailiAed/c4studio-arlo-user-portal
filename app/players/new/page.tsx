"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { PlayerForm, type PlayerFormValues } from "@/components/players/player-form";
import { useActiveOrg } from "@/components/active-org-provider";

export default function NewPlayerPage() {
  const router = useRouter();
  const { activeOrgId } = useActiveOrg();
  const createPlayer = useMutation(api.players.createPlayer);

  const handleSubmit = async (values: PlayerFormValues) => {
    if (!activeOrgId) return;
    await createPlayer({ orgId: activeOrgId, ...values });
    router.push("/players");
  };

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl">
        <PlayerForm mode="create" onSubmit={handleSubmit} />
      </div>
    </main>
  );
}
