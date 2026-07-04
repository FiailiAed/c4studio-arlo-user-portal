"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export function ImpersonationBanner() {
  const { actor } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const router = useRouter();

  if (!actor) return null;

  async function handleExit() {
    const adminSessionId = sessionStorage.getItem("adminSessionId");
    try {
      if (!adminSessionId) throw new Error("no captured admin session");
      await clerk.setActive({ session: adminSessionId });
      sessionStorage.removeItem("adminSessionId");
      router.push("/admin/users");
    } catch {
      sessionStorage.removeItem("adminSessionId");
      await clerk.signOut();
      router.push("/sign-in");
    }
  }

  return (
    <div className="bg-amber-500 text-black px-4 py-2 flex items-center justify-between text-sm">
      <span>Viewing as {user?.fullName ?? "user"} (impersonation)</span>
      <button onClick={handleExit} className="underline underline-offset-2">
        Exit impersonation
      </button>
    </div>
  );
}
