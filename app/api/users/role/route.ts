import { auth, clerkClient } from "@clerk/nextjs/server";
import { hasAnyRole, type AppRole } from "@/lib/roles";

const VALID_ROLES: AppRole[] = ["family", "referee", "program_admin", "coach", "league_admin", "super_admin"];

export async function POST(request: Request) {
  const { sessionClaims } = await auth();
  const callerRoles = (sessionClaims?.metadata as { roles?: AppRole[] } | undefined)?.roles;
  if (!hasAnyRole(callerRoles, ["league_admin", "super_admin"])) {
    return new Response("Forbidden", { status: 403 });
  }

  const { userIds, roles } = await request.json();
  const isValidIds =
    Array.isArray(userIds) && userIds.length > 0 && userIds.every((id) => typeof id === "string");
  const isValidRoles =
    Array.isArray(roles) && roles.every((r) => VALID_ROLES.includes(r));
  if (!isValidIds || !isValidRoles) {
    return new Response("Invalid request", { status: 400 });
  }

  const client = await clerkClient();
  await Promise.all(
    (userIds as string[]).map((userId) => client.users.updateUser(userId, { publicMetadata: { roles } }))
  );

  return new Response(null, { status: 200 });
}
