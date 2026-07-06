import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

async function callerIsSuperAdmin(authResult: Awaited<ReturnType<typeof auth>>): Promise<boolean> {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const token = await authResult.getToken({ template: "convex" });
  if (!token) return false;
  convex.setAuth(token);
  return await convex.query(api.orgMemberships.amISuperAdmin, {});
}

export async function POST(request: Request) {
  const authResult = await auth();
  const { userId: callerId } = authResult;
  if (!callerId || !(await callerIsSuperAdmin(authResult))) {
    return new Response("Forbidden", { status: 403 });
  }

  const { name } = await request.json();
  if (typeof name !== "string" || !name.trim()) {
    return new Response("Invalid request", { status: 400 });
  }

  const client = await clerkClient();
  try {
    const organization = await client.organizations.createOrganization({
      name: name.trim(),
      createdBy: callerId,
    });
    return Response.json({ id: organization.id, name: organization.name });
  } catch {
    return new Response("Failed to create organization", { status: 500 });
  }
}
