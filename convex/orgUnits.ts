import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";
import type { Id } from "./_generated/dataModel";

export const listOrgUnits = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    return await ctx.db
      .query("orgUnits")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
  },
});

export const createOrgUnit = mutation({
  args: {
    orgId: v.string(),
    parentUnitId: v.optional(v.id("orgUnits")),
    unitType: v.string(),
    name: v.string(),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    if (args.parentUnitId) {
      const parent = await ctx.db.get(args.parentUnitId);
      if (!parent || parent.orgId !== args.orgId) throw new Error("Parent not found in this org");
    }

    return await ctx.db.insert("orgUnits", {
      orgId: args.orgId,
      parentUnitId: args.parentUnitId,
      unitType: args.unitType,
      name: args.name,
      order: args.order,
    });
  },
});

export const renameOrgUnit = mutation({
  args: {
    orgId: v.string(),
    unitId: v.id("orgUnits"),
    name: v.optional(v.string()),
    unitType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const unit = await ctx.db.get(args.unitId);
    if (!unit || unit.orgId !== args.orgId) throw new Error("Unit not found in this org");

    await ctx.db.patch(args.unitId, {
      name: args.name ?? unit.name,
      unitType: args.unitType ?? unit.unitType,
    });
  },
});

async function isDescendant(
  ctx: { db: { get: (id: Id<"orgUnits">) => Promise<{ parentUnitId?: Id<"orgUnits"> } | null> } },
  candidateId: Id<"orgUnits">,
  ancestorId: Id<"orgUnits">
): Promise<boolean> {
  let current = await ctx.db.get(candidateId);
  while (current?.parentUnitId) {
    if (current.parentUnitId === ancestorId) return true;
    current = await ctx.db.get(current.parentUnitId);
  }
  return false;
}

export const moveOrgUnit = mutation({
  args: {
    orgId: v.string(),
    unitId: v.id("orgUnits"),
    newParentUnitId: v.optional(v.id("orgUnits")),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const unit = await ctx.db.get(args.unitId);
    if (!unit || unit.orgId !== args.orgId) throw new Error("Unit not found in this org");

    if (args.newParentUnitId) {
      if (args.newParentUnitId === args.unitId) throw new Error("A unit cannot be its own parent");
      const newParent = await ctx.db.get(args.newParentUnitId);
      if (!newParent || newParent.orgId !== args.orgId) throw new Error("Parent not found in this org");
      if (await isDescendant(ctx, args.newParentUnitId, args.unitId)) {
        throw new Error("Cannot move a unit under its own descendant");
      }
    }

    await ctx.db.patch(args.unitId, { parentUnitId: args.newParentUnitId });
  },
});

export const deleteOrgUnit = mutation({
  args: { orgId: v.string(), unitId: v.id("orgUnits") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const unit = await ctx.db.get(args.unitId);
    if (!unit || unit.orgId !== args.orgId) throw new Error("Unit not found in this org");

    const children = await ctx.db
      .query("orgUnits")
      .withIndex("by_org_and_parent", (q) => q.eq("orgId", args.orgId).eq("parentUnitId", args.unitId))
      .collect();
    if (children.length > 0) throw new Error("Delete or move this unit's children first");

    await ctx.db.delete(args.unitId);
  },
});
