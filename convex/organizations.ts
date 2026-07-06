import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperAdminMutation, requireSuperAdminQuery } from "./lib/auth";

/** Every org the caller belongs to (drives the custom org-switcher UI). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const memberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .collect();

    const active = memberships.filter((m) => m.status === "active");
    const orgs = await Promise.all(active.map((m) => ctx.db.get(m.orgId)));
    return active.map((m, i) => ({
      org: orgs[i],
      roles: m.roles,
    })).filter((entry) => entry.org !== null);
  },
});

/** Platform-wide org list — super_admin only. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireSuperAdminQuery(ctx);
    if (!identity) return null;
    return await ctx.db.query("organizations").collect();
  },
});

export const get = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db.get(orgId);
  },
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Creates a tenant and immediately makes the caller its first
 * league_admin + super_admin. No approval workflow: org creation is already
 * gated to the most trusted platform role, so an approval step would add a
 * state machine without a real safety benefit.
 */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const identity = await requireSuperAdminMutation(ctx);

    const baseSlug = slugify(name);
    let slug = baseSlug;
    let suffix = 1;
    while (await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", slug)).unique()) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const orgId = await ctx.db.insert("organizations", {
      name,
      slug,
      createdAt: Date.now(),
    });

    await ctx.db.insert("orgMemberships", {
      clerkId: identity.subject,
      orgId,
      roles: ["league_admin", "super_admin"],
      status: "active",
    });

    return orgId;
  },
});

export const rename = mutation({
  args: { orgId: v.id("organizations"), name: v.string() },
  handler: async (ctx, { orgId, name }) => {
    await requireSuperAdminMutation(ctx);
    await ctx.db.patch(orgId, { name });
  },
});
