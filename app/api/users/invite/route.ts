import { auth } from "@clerk/nextjs/server";
import { hasAnyRole, type AppRole } from "@/lib/roles";

const VALID_ROLES: AppRole[] = ["family", "referee", "program_admin", "coach", "league_admin", "super_admin"];
const ADMIN_ROLES: AppRole[] = ["league_admin", "super_admin"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { userId: callerId, orgId: callerOrgId, orgRole } = await auth();
  if (!callerId || !callerOrgId || orgRole !== "org:admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { orgId, email, roles } = await request.json();
  if (orgId !== callerOrgId) {
    return new Response("Forbidden", { status: 403 });
  }
  const isValidRoles = Array.isArray(roles) && roles.length > 0 && roles.every((r) => VALID_ROLES.includes(r));
  if (typeof email !== "string" || !EMAIL_REGEX.test(email) || !isValidRoles) {
    return new Response("Invalid request", { status: 400 });
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return new Response("Missing CLERK_SECRET_KEY", { status: 500 });

  // An organization invitation, not an instance-wide one — this is what
  // actually adds the invitee to THIS org on acceptance. Its public_metadata
  // (the AppRole[] array) transfers automatically to the resulting
  // organization membership, which the existing organizationMembership.created
  // webhook already reads into Convex's orgMemberships — no webhook changes
  // needed.
  const nativeRole = hasAnyRole(roles, ADMIN_ROLES) ? "org:admin" : "org:member";

  const res = await fetch(`https://api.clerk.com/v1/organizations/${orgId}/invitations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email_address: email,
      inviter_user_id: callerId,
      role: nativeRole,
      public_metadata: { roles },
      redirect_url: new URL("/sign-up", request.url).toString(),
    }),
  });

  if (!res.ok) {
    if (res.status === 400 || res.status === 422) {
      return new Response("An invitation or account for this email already exists", { status: 409 });
    }
    return new Response("Failed to send invitation", { status: 500 });
  }

  const invitation = await res.json();
  return Response.json({ id: invitation.id, emailAddress: invitation.email_address });
}
