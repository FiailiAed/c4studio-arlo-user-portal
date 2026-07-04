import { auth, clerkClient } from "@clerk/nextjs/server";
import type { AppRole } from "@/lib/roles";

const VALID_ROLES: AppRole[] = ["family", "referee", "program_admin", "league_admin", "super_admin"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { sessionClaims } = await auth();
  const callerRole = (sessionClaims?.metadata as { role?: AppRole } | undefined)?.role;
  if (callerRole !== "league_admin" && callerRole !== "super_admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { email, role } = await request.json();
  if (typeof email !== "string" || !EMAIL_REGEX.test(email) || !VALID_ROLES.includes(role)) {
    return new Response("Invalid request", { status: 400 });
  }

  const client = await clerkClient();
  try {
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role },
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
