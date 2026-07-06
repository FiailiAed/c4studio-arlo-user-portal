import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

/** The caller's own roles in a given org — powers every client-side role gate. */
export const getMyRoles = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const membership = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org_and_clerk_id", (q) => q.eq("orgId", orgId).eq("clerkId", identity.subject))
      .unique();
    if (!membership || membership.status !== "active") return null;
    return membership.roles;
  },
});

/** Cross-org: is the caller a super_admin anywhere (platform operator check). */
export const amISuperAdmin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const memberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .collect();
    return memberships.some((m) => m.status === "active" && m.roles.includes("super_admin"));
  },
});

/** All active members of an org, joined with their user profile — league_admin only. */
export const listMembers = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    const identity = await requireLeagueAdminQuery(ctx, orgId);
    if (!identity) return null;

    const memberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const users = await Promise.all(
      memberships.map((m) =>
        ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", m.clerkId))
          .unique()
      )
    );

    return memberships.map((m, i) => ({
      membershipId: m._id,
      clerkId: m.clerkId,
      roles: m.roles,
      user: users[i],
    }));
  },
});

async function countPlatformSuperAdmins(ctx: QueryCtx | MutationCtx) {
  const all = await ctx.db.query("orgMemberships").collect();
  return all.filter((m) => m.status === "active" && m.roles.includes("super_admin")).length;
}

export const updateRoles = mutation({
  args: {
    membershipId: v.id("orgMemberships"),
    roles: v.array(v.string()),
  },
  handler: async (ctx, { membershipId, roles }) => {
    const membership = await ctx.db.get(membershipId);
    if (!membership) throw new Error("Membership not found");

    await requireLeagueAdminMutation(ctx, membership.orgId);

    const losingSuperAdmin = membership.roles.includes("super_admin") && !roles.includes("super_admin");
    if (losingSuperAdmin && (await countPlatformSuperAdmins(ctx)) <= 1) {
      throw new Error("Cannot remove the platform's last super_admin");
    }

    await ctx.db.patch(membershipId, { roles });
  },
});

export const removeMember = mutation({
  args: { membershipId: v.id("orgMemberships") },
  handler: async (ctx, { membershipId }) => {
    const membership = await ctx.db.get(membershipId);
    if (!membership) throw new Error("Membership not found");

    await requireLeagueAdminMutation(ctx, membership.orgId);

    if (membership.roles.includes("super_admin") && (await countPlatformSuperAdmins(ctx)) <= 1) {
      throw new Error("Cannot remove the platform's last super_admin");
    }

    await ctx.db.patch(membershipId, { status: "removed" });
  },
});
