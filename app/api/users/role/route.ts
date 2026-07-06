import { auth } from "@clerk/nextjs/server";
import { hasAnyRole, type AppRole } from "@/lib/roles";

const VALID_ROLES: AppRole[] = ["family", "referee", "program_admin", "coach", "league_admin", "super_admin"];
const ADMIN_ROLES: AppRole[] = ["league_admin", "super_admin"];

export async function POST(request: Request) {
  const { orgId: callerOrgId, orgRole } = await auth();
  if (!callerOrgId || orgRole !== "org:admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { orgId, userIds, roles } = await request.json();
  if (orgId !== callerOrgId) {
    return new Response("Forbidden", { status: 403 });
  }
  const isValidIds =
    Array.isArray(userIds) && userIds.length > 0 && userIds.every((id) => typeof id === "string");
  const isValidRoles =
    Array.isArray(roles) && roles.every((r) => VALID_ROLES.includes(r));
  if (!isValidIds || !isValidRoles) {
    return new Response("Invalid request", { status: 400 });
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return new Response("Missing CLERK_SECRET_KEY", { status: 500 });

  // Roles live in the org membership's public_metadata (read back into Convex's
  // orgMemberships via the organizationMembership.updated webhook). The native
  // Clerk org role (org:admin / org:member) is kept in sync alongside it since
  // proxy.ts and other server-side routes gate on that native role for a cheap,
  // no-Convex-round-trip check.
  const nativeRole = hasAnyRole(roles, ADMIN_ROLES) ? "org:admin" : "org:member";

  const results = await Promise.all(
    (userIds as string[]).map(async (userId) => {
      const roleRes = await fetch(`https://api.clerk.com/v1/organizations/${orgId}/memberships/${userId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: nativeRole }),
      });
      const metadataRes = await fetch(
        `https://api.clerk.com/v1/organizations/${orgId}/memberships/${userId}/metadata`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ public_metadata: { roles } }),
        }
      );
      return roleRes.ok && metadataRes.ok;
    })
  );

  if (results.some((ok) => !ok)) {
    return new Response("Failed to update one or more users", { status: 502 });
  }

  return new Response(null, { status: 200 });
}
