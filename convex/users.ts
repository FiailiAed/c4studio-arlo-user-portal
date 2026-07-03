import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

export const upsertUser = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const fields = {
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("users", { clerkId: identity.subject, ...fields });
  },
});

export const updateProfile = mutation({
  args: {
    phone: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.string(),
        city: v.string(),
        state: v.string(),
        zip: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      phone: args.phone,
      dateOfBirth: args.dateOfBirth,
      address: args.address,
    });
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    // Return null rather than throw — Convex re-runs the query once the auth
    // token arrives. Throwing leaves useQuery permanently errored on fast loads.
    if (!identity) return null;

    const jwtRole = (identity["metadata"] as { role?: string } | undefined)?.role;

    if (jwtRole !== "league_admin") {
      const caller = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
      if (caller?.role !== "league_admin") throw new Error("Forbidden");
    }

    return await ctx.db.query("users").collect();
  },
});

export const syncFromWebhook = internalMutation({
  args: {
    clerkId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    const fields = {
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      role: args.role,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("users", { clerkId: args.clerkId, ...fields });
    }
  },
});
