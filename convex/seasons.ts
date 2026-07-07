import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listSeasons = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    return await ctx.db
      .query("seasons")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
  },
});

export const createSeason = mutation({
  args: {
    orgId: v.string(),
    name: v.string(),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    return await ctx.db.insert("seasons", {
      orgId: args.orgId,
      name: args.name,
      startDate: args.startDate,
      endDate: args.endDate,
    });
  },
});

export const updateSeason = mutation({
  args: {
    orgId: v.string(),
    seasonId: v.id("seasons"),
    name: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const season = await ctx.db.get(args.seasonId);
    if (!season || season.orgId !== args.orgId) throw new Error("Season not found in this org");

    await ctx.db.patch(args.seasonId, {
      name: args.name ?? season.name,
      startDate: args.startDate ?? season.startDate,
      endDate: args.endDate ?? season.endDate,
    });
  },
});

export const deleteSeason = mutation({
  args: { orgId: v.string(), seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const season = await ctx.db.get(args.seasonId);
    if (!season || season.orgId !== args.orgId) throw new Error("Season not found in this org");

    const gameInSeason = await ctx.db
      .query("games")
      .withIndex("by_org_and_season", (q) => q.eq("orgId", args.orgId).eq("seasonId", args.seasonId))
      .first();
    if (gameInSeason) throw new Error("Season has games scheduled in it");

    await ctx.db.delete(args.seasonId);
  },
});
