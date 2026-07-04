"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useState } from "react";

export function ImpersonationBanner() {
  const { actor } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const [exiting, setExiting] = useState(false);

  if (!actor) return null;

  async function handleExit() {
    setExiting(true);

    const res = await fetch("/api/admin/exit-impersonation", { method: "POST" });
    if (!res.ok) {
      setExiting(false);
      return;
    }

    const { url } = await res.json();
    // Same single-session constraint as entering impersonation: sign out of
    // the impersonated session before redeeming the ticket back to the admin.
    await clerk.signOut();
    window.location.href = url;
  }

  return (
    <div className="bg-amber-500 text-black px-4 py-2 flex items-center justify-between text-sm">
      <span>Viewing as {user?.fullName ?? "user"} (impersonation)</span>
      <button onClick={handleExit} disabled={exiting} className="underline underline-offset-2">
        {exiting ? "Exiting…" : "Exit impersonation"}
      </button>
    </div>
  );
}
