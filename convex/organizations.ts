import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperAdminQuery } from "./lib/auth";

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireSuperAdminQuery(ctx);
    if (!identity) return null;

    return await ctx.db.query("organizations").collect();
  },
});

export const upsertFromWebhook = internalMutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name, slug: args.slug });
    } else {
      await ctx.db.insert("organizations", {
        clerkOrgId: args.clerkOrgId,
        name: args.name,
        slug: args.slug,
        createdAt: Date.now(),
      });
    }
  },
});

export const deleteByClerkOrgId = internalMutation({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, { clerkOrgId }) => {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", clerkOrgId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
