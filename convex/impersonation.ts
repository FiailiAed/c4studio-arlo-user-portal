import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const logStart = mutation({
  args: { targetClerkId: v.string() },
  handler: async (ctx, { targetClerkId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const jwtRoles = (identity["metadata"] as { roles?: string[] } | undefined)?.roles;

    if (!jwtRoles?.includes("super_admin")) {
      const caller = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
      if (!caller?.roles?.includes("super_admin")) throw new Error("Forbidden");
    }

    await ctx.db.insert("impersonationEvents", {
      adminClerkId: identity.subject,
      targetClerkId,
      startedAt: Date.now(),
    });
  },
});
