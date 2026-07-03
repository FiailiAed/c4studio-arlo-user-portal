import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) return new Response("Missing secret", { status: 500 });

    const body = await request.text();
    const wh = new Webhook(secret);
    let event: any;
    try {
      event = wh.verify(body, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      });
    } catch {
      return new Response("Invalid signature", { status: 400 });
    }

    if (event.type === "user.created" || event.type === "user.updated") {
      const { id, first_name, last_name, email_addresses, public_metadata } = event.data;
      await ctx.runMutation(internal.users.syncFromWebhook, {
        clerkId: id,
        firstName: first_name ?? undefined,
        lastName: last_name ?? undefined,
        email: email_addresses?.[0]?.email_address,
        role: public_metadata?.role,
      });
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
