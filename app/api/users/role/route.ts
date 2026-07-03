import { auth, clerkClient } from "@clerk/nextjs/server";
import type { AppRole } from "@/lib/roles";

const VALID_ROLES: AppRole[] = ["family", "referee", "program_admin", "league_admin"];

export async function POST(request: Request) {
  const { sessionClaims } = await auth();
  const callerRole = (sessionClaims as any)?.metadata?.role;
  if (callerRole !== "league_admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { userId, role } = await request.json();
  if (!userId || !VALID_ROLES.includes(role)) {
    return new Response("Invalid request", { status: 400 });
  }

  const client = await clerkClient();
  await client.users.updateUser(userId, { publicMetadata: { role } });

  return new Response(null, { status: 200 });
}
