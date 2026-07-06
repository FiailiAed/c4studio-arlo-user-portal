import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/** The signed-in user's roles within a specific org — the org-scoped replacement for the old global `users.roles`. */
export const getMyRoles = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const membership = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org_and_clerk_id", (q) => q.eq("orgId", args.orgId).eq("clerkId", identity.subject))
      .unique();
    return membership?.roles ?? [];
  },
});

/**
 * Cross-org platform-operator check, exposed for Next.js API routes that
 * need it (org creation, impersonation) — these run before/outside any
 * specific org context, so they can't use the per-org gate helpers. Mirrors
 * requireSuperAdminQuery's logic but is a plain boolean, not an auth gate
 * itself: it's meant to be called by a route that already has the caller's
 * identity via a forwarded Convex JWT.
 */
export const amISuperAdmin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const memberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .collect();
    return memberships.some((m) => m.roles.includes("super_admin"));
  },
});

export const upsertFromWebhook = internalMutation({
  args: {
    clerkId: v.string(),
    orgId: v.string(),
    roles: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org_and_clerk_id", (q) => q.eq("orgId", args.orgId).eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { roles: args.roles });
    } else {
      await ctx.db.insert("orgMemberships", {
        clerkId: args.clerkId,
        orgId: args.orgId,
        roles: args.roles,
      });
    }
  },
});

export const deleteByOrgAndClerkId = internalMutation({
  args: { clerkId: v.string(), orgId: v.string() },
  handler: async (ctx, { clerkId, orgId }) => {
    const existing = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org_and_clerk_id", (q) => q.eq("orgId", orgId).eq("clerkId", clerkId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
