import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";

const http = httpRouter();

interface ClerkWebhookEvent {
  type: string;
  data: {
    // user.*
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email_addresses?: { email_address: string }[];
    public_metadata?: { roles?: string[] };
    // organization.*
    name?: string;
    slug?: string | null;
    // organizationMembership.*
    organization?: { id: string };
    public_user_data?: { user_id: string };
  };
}

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) return new Response("Missing secret", { status: 500 });

    const body = await request.text();
    const wh = new Webhook(secret);
    let event: ClerkWebhookEvent;
    try {
      event = wh.verify(body, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      }) as ClerkWebhookEvent;
    } catch {
      return new Response("Invalid signature", { status: 400 });
    }

    switch (event.type) {
      case "user.created":
      case "user.updated": {
        const { id, first_name, last_name, email_addresses } = event.data;
        await ctx.runMutation(internal.users.syncFromWebhook, {
          clerkId: id,
          firstName: first_name ?? undefined,
          lastName: last_name ?? undefined,
          email: email_addresses?.[0]?.email_address,
        });
        break;
      }
      case "user.deleted": {
        await ctx.runMutation(internal.users.deleteByClerkId, { clerkId: event.data.id });
        break;
      }
      case "organization.created":
      case "organization.updated": {
        const { id, name, slug } = event.data;
        await ctx.runMutation(internal.organizations.upsertFromWebhook, {
          clerkOrgId: id,
          name: name ?? "",
          slug: slug ?? undefined,
        });
        break;
      }
      case "organization.deleted": {
        await ctx.runMutation(internal.organizations.deleteByClerkOrgId, {
          clerkOrgId: event.data.id,
        });
        break;
      }
      case "organizationMembership.created":
      case "organizationMembership.updated": {
        const orgId = event.data.organization?.id;
        const clerkId = event.data.public_user_data?.user_id;
        if (orgId && clerkId) {
          await ctx.runMutation(internal.orgMemberships.upsertFromWebhook, {
            clerkId,
            orgId,
            roles: event.data.public_metadata?.roles ?? [],
          });
        }
        break;
      }
      case "organizationMembership.deleted": {
        const orgId = event.data.organization?.id;
        const clerkId = event.data.public_user_data?.user_id;
        if (orgId && clerkId) {
          await ctx.runMutation(internal.orgMemberships.deleteByOrgAndClerkId, { clerkId, orgId });
        }
        break;
      }
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
