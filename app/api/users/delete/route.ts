import { auth, clerkClient } from "@clerk/nextjs/server";

export async function POST(request: Request) {
  const { userId: callerId, orgId, orgRole } = await auth();
  if (!orgId || orgRole !== "org:admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { userId } = await request.json();
  if (typeof userId !== "string" || !userId) {
    return new Response("Invalid request", { status: 400 });
  }
  if (userId === callerId) {
    return new Response("You cannot delete your own account", { status: 400 });
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return new Response("Missing CLERK_SECRET_KEY", { status: 500 });

  const membershipRes = await fetch(`https://api.clerk.com/v1/organizations/${orgId}/memberships/${userId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (membershipRes.ok) {
    const membership = (await membershipRes.json()) as { public_metadata?: { roles?: string[] } };
    if (membership.public_metadata?.roles?.includes("super_admin")) {
      return new Response("Cannot delete a super admin account", { status: 400 });
    }
  }

  const client = await clerkClient();
  await client.users.deleteUser(userId);

  return new Response(null, { status: 200 });
}
