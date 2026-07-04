import { auth, clerkClient } from "@clerk/nextjs/server";
import { hasAnyRole, type AppRole } from "@/lib/roles";

const VALID_ROLES: AppRole[] = ["family", "referee", "program_admin", "coach", "league_admin", "super_admin"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { sessionClaims } = await auth();
  const callerRoles = (sessionClaims?.metadata as { roles?: AppRole[] } | undefined)?.roles;
  if (!hasAnyRole(callerRoles, ["league_admin", "super_admin"])) {
    return new Response("Forbidden", { status: 403 });
  }

  const { email, roles } = await request.json();
  const isValidRoles = Array.isArray(roles) && roles.length > 0 && roles.every((r) => VALID_ROLES.includes(r));
  if (typeof email !== "string" || !EMAIL_REGEX.test(email) || !isValidRoles) {
    return new Response("Invalid request", { status: 400 });
  }

  const client = await clerkClient();
  try {
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { roles },
      notify: true,
      ignoreExisting: false,
      redirectUrl: new URL("/sign-up", request.url).toString(),
    });
    return Response.json({ id: invitation.id, emailAddress: invitation.emailAddress });
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    if (status === 400 || status === 422) {
      return new Response("An invitation or account for this email already exists", { status: 409 });
    }
    return new Response("Failed to send invitation", { status: 500 });
  }
}
