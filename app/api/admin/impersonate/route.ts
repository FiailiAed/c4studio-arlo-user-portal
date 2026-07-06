import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export async function POST(request: Request) {
  const authResult = await auth();
  const { userId: callerId } = authResult;

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const token = await authResult.getToken({ template: "convex" });
  if (!token) return new Response("Not authenticated", { status: 401 });
  convex.setAuth(token);

  // super_admin is a cross-org platform capability (see convex/lib/auth.ts),
  // so this checks membership across all orgs rather than a specific orgId.
  const isSuperAdmin = await convex.query(api.orgMemberships.amISuperAdmin);
  if (!isSuperAdmin) {
    return new Response("Forbidden", { status: 403 });
  }

  const { targetClerkId } = await request.json();
  if (typeof targetClerkId !== "string" || !targetClerkId) {
    return new Response("Invalid request", { status: 400 });
  }

  const client = await clerkClient();
  let actorToken;
  try {
    actorToken = await client.actorTokens.create({
      userId: targetClerkId,
      actor: { sub: callerId! },
    });
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    return new Response("Failed to start impersonation", { status: status === 404 ? 404 : 500 });
  }

  if (!actorToken.token) {
    return new Response("Failed to start impersonation", { status: 500 });
  }

  // actorTokens.create() has no redirectUrl param, so actorToken.url defaults to
  // Clerk's hosted Account Portal instead of this app's own /sign-in page. Build
  // our own ticket-redemption URL instead, the way invitations use redirectUrl.
  const redemptionUrl = new URL("/sign-in", request.url);
  redemptionUrl.searchParams.set("__clerk_ticket", actorToken.token);
  redemptionUrl.searchParams.set("redirect_url", "/dashboard");

  try {
    await convex.mutation(api.impersonation.logStart, { targetClerkId });
  } catch (err) {
    console.error("Failed to log impersonation event", err);
  }

  return Response.json({ url: redemptionUrl.toString() });
}
