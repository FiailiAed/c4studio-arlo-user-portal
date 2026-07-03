import { auth, clerkClient } from "@clerk/nextjs/server";
import type { AppRole } from "@/lib/roles";

const VALID_ROLES: AppRole[] = ["family", "referee", "program_admin", "league_admin"];

export async function POST(request: Request) {
  const { sessionClaims } = await auth();
  const callerRole = (sessionClaims?.metadata as { role?: AppRole } | undefined)?.role;
  if (callerRole !== "league_admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { userIds, role } = await request.json();
  const isValidIds =
    Array.isArray(userIds) && userIds.length > 0 && userIds.every((id) => typeof id === "string");
  if (!isValidIds || !VALID_ROLES.includes(role)) {
    return new Response("Invalid request", { status: 400 });
  }

  const client = await clerkClient();
  await Promise.all(
    (userIds as string[]).map((userId) => client.users.updateUser(userId, { publicMetadata: { role } }))
  );

  return new Response(null, { status: 200 });
}
