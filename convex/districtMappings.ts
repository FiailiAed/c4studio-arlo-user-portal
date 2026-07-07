import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listMappings = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    const identity = await requireLeagueAdminQuery(ctx, orgId);
    if (!identity) return null;
    return await ctx.db
      .query("districtMappings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

/** Creates a mapping, or updates it in place if one already exists for the same (orgId, districtName, municipality). */
export const upsertMapping = mutation({
  args: {
    orgId: v.id("organizations"),
    districtName: v.string(),
    municipality: v.optional(v.string()),
    orgUnitId: v.id("orgUnits"),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const orgUnit = await ctx.db.get(args.orgUnitId);
    if (!orgUnit || orgUnit.orgId !== args.orgId) throw new Error("Org unit not found");

    const candidates = await ctx.db
      .query("districtMappings")
      .withIndex("by_org_and_district", (q) => q.eq("orgId", args.orgId).eq("districtName", args.districtName))
      .collect();
    const existing = candidates.find((m) => (m.municipality ?? undefined) === (args.municipality ?? undefined));

    if (existing) {
      await ctx.db.patch(existing._id, { orgUnitId: args.orgUnitId });
      return existing._id;
    }

    return await ctx.db.insert("districtMappings", args);
  },
});

export const deleteMapping = mutation({
  args: { mappingId: v.id("districtMappings") },
  handler: async (ctx, { mappingId }) => {
    const mapping = await ctx.db.get(mappingId);
    if (!mapping) throw new Error("Mapping not found");
    await requireLeagueAdminMutation(ctx, mapping.orgId);
    await ctx.db.delete(mappingId);
  },
});
