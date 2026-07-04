import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { AppRole } from "@/lib/roles";

export async function POST(request: Request) {
  const authResult = await auth();
  const { userId: callerId, sessionClaims } = authResult;
  const callerRole = (sessionClaims?.metadata as { role?: AppRole } | undefined)?.role;
  if (callerRole !== "super_admin") {
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

  try {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    const token = await authResult.getToken({ template: "convex" });
    if (token) convex.setAuth(token);
    await convex.mutation(api.impersonation.logStart, { targetClerkId });
  } catch (err) {
    console.error("Failed to log impersonation event", err);
  }

  return Response.json({ url: actorToken.url });
}
