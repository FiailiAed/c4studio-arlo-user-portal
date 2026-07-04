import { auth, clerkClient } from "@clerk/nextjs/server";
import { hasAnyRole, type AppRole } from "@/lib/roles";

export async function POST(request: Request) {
  const { userId: callerId, sessionClaims } = await auth();
  const callerRoles = (sessionClaims?.metadata as { roles?: AppRole[] } | undefined)?.roles;
  if (!hasAnyRole(callerRoles, ["league_admin", "super_admin"])) {
    return new Response("Forbidden", { status: 403 });
  }

  const { userId } = await request.json();
  if (typeof userId !== "string" || !userId) {
    return new Response("Invalid request", { status: 400 });
  }
  if (userId === callerId) {
    return new Response("You cannot delete your own account", { status: 400 });
  }

  const client = await clerkClient();
  await client.users.deleteUser(userId);

  return new Response(null, { status: 200 });
}
