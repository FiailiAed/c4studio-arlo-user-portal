import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const setRole = internalMutation({
  args: { clerkId: v.string(), role: v.string() },
  handler: async (ctx, { clerkId, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) throw new Error("User not found");
    await ctx.db.patch(user._id, { role });
  },
});
