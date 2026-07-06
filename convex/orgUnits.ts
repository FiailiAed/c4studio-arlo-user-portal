import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listOrgUnits = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    const identity = await requireLeagueAdminQuery(ctx, orgId);
    if (!identity) return null;
    return await ctx.db
      .query("orgUnits")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const createOrgUnit = mutation({
  args: {
    orgId: v.id("organizations"),
    parentUnitId: v.optional(v.id("orgUnits")),
    unitType: v.string(),
    name: v.string(),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);
    return await ctx.db.insert("orgUnits", args);
  },
});

export const renameOrgUnit = mutation({
  args: { orgUnitId: v.id("orgUnits"), name: v.string() },
  handler: async (ctx, { orgUnitId, name }) => {
    const unit = await ctx.db.get(orgUnitId);
    if (!unit) throw new Error("Org unit not found");
    await requireLeagueAdminMutation(ctx, unit.orgId);
    await ctx.db.patch(orgUnitId, { name });
  },
});

async function isDescendant(
  ctx: MutationCtx,
  candidateAncestorId: Id<"orgUnits">,
  nodeId: Id<"orgUnits">
): Promise<boolean> {
  let current = await ctx.db.get(nodeId);
  while (current?.parentUnitId) {
    if (current.parentUnitId === candidateAncestorId) return true;
    current = await ctx.db.get(current.parentUnitId);
  }
  return false;
}

export const moveOrgUnit = mutation({
  args: { orgUnitId: v.id("orgUnits"), newParentUnitId: v.optional(v.id("orgUnits")) },
  handler: async (ctx, { orgUnitId, newParentUnitId }) => {
    const unit = await ctx.db.get(orgUnitId);
    if (!unit) throw new Error("Org unit not found");
    await requireLeagueAdminMutation(ctx, unit.orgId);

    if (newParentUnitId) {
      if (newParentUnitId === orgUnitId) throw new Error("A unit cannot be its own parent");
      const newParent = await ctx.db.get(newParentUnitId);
      if (!newParent || newParent.orgId !== unit.orgId) throw new Error("Invalid parent");
      if (await isDescendant(ctx, orgUnitId, newParentUnitId)) {
        throw new Error("Cannot move a unit under its own descendant");
      }
    }

    await ctx.db.patch(orgUnitId, { parentUnitId: newParentUnitId });
  },
});

export const deleteOrgUnit = mutation({
  args: { orgUnitId: v.id("orgUnits") },
  handler: async (ctx, { orgUnitId }) => {
    const unit = await ctx.db.get(orgUnitId);
    if (!unit) throw new Error("Org unit not found");
    await requireLeagueAdminMutation(ctx, unit.orgId);

    const children = await ctx.db
      .query("orgUnits")
      .withIndex("by_org_and_parent", (q) => q.eq("orgId", unit.orgId).eq("parentUnitId", orgUnitId))
      .collect();
    if (children.length > 0) throw new Error("Cannot delete a unit that has children");

    await ctx.db.delete(orgUnitId);
  },
});
