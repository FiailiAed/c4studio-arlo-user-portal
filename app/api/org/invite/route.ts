import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { hasAnyRole, type AppRole } from "@/lib/roles";
import type { Id } from "@/convex/_generated/dataModel";

const VALID_ROLES: AppRole[] = ["family", "referee", "program_admin", "coach", "league_admin", "super_admin"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Replaces the old Clerk-org-invitation flow. There is no Clerk org for us
 * to invite into anymore, so this does two independent things:
 *  1. Records the org + role assignment in Convex (`orgInvitations.createInvite`),
 *     which `acceptMyPendingInvites` matches against the invitee's verified
 *     email right after they sign in/up.
 *  2. Fires a plain Clerk *account* invitation email (not an org invite) so
 *     the invitee actually gets an email and a way to create an account.
 */
export async function POST(request: Request) {
  const authResult = await auth();
  const { orgId, email, roles } = await request.json();

  const isValidOrgId = typeof orgId === "string" && orgId.length > 0;
  const isValidRoles = Array.isArray(roles) && roles.length > 0 && roles.every((r) => VALID_ROLES.includes(r));
  if (!isValidOrgId || typeof email !== "string" || !EMAIL_REGEX.test(email) || !isValidRoles) {
    return new Response("Invalid request", { status: 400 });
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const token = await authResult.getToken({ template: "convex" });
  if (!token) return new Response("Not authenticated", { status: 401 });
  convex.setAuth(token);

  // Explicit query-side check before doing anything else, mirroring the
  // pattern the previous Clerk-metadata-based invite route used (check the
  // caller's role, then act) — the createInvite mutation also enforces this
  // server-side, so this is defense in depth plus a clean 403 for the UI.
  const callerRoles = await convex.query(api.orgMemberships.getMyRoles, { orgId: orgId as Id<"organizations"> });
  if (!hasAnyRole(callerRoles ?? undefined, ["league_admin", "super_admin"])) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    await convex.mutation(api.orgInvitations.createInvite, {
      orgId: orgId as Id<"organizations">,
      email,
      roles,
    });
  } catch (err) {
    console.error("Failed to record org invitation", err);
    return new Response("Failed to send invitation", { status: 500 });
  }

  const client = await clerkClient();
  try {
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      notify: true,
      ignoreExisting: false,
      redirectUrl: new URL("/sign-up", request.url).toString(),
    });
    return Response.json({ id: invitation.id, emailAddress: invitation.emailAddress });
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    if (status === 400 || status === 422) {
      // An account invitation or account for this email already exists.
      // The Convex-side invite row we just wrote is still valid and will be
      // picked up by acceptMyPendingInvites the next time they sign in.
      return Response.json({ ok: true, accountInviteSkipped: true });
    }
    console.error("Failed to send Clerk account invitation", err);
    return Response.json({ ok: true, accountInviteSkipped: true });
  }
}
