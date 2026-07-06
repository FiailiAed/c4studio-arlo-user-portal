import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperAdminMutation } from "./lib/auth";

export const logStart = mutation({
  args: { targetClerkId: v.string() },
  handler: async (ctx, { targetClerkId }) => {
    const identity = await requireSuperAdminMutation(ctx);

    await ctx.db.insert("impersonationEvents", {
      adminClerkId: identity.subject,
      targetClerkId,
      startedAt: Date.now(),
    });
  },
});
