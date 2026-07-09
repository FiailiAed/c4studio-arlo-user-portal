import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listPlacementsForSeason = query({
  args: { orgId: v.string(), seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const placements = await ctx.db
      .query("teamSeasonPlacements")
      .withIndex("by_org_and_season_and_orgUnit", (q) => q.eq("orgId", args.orgId).eq("seasonId", args.seasonId))
      .collect();

    const results = [];
    for (const placement of placements) {
      const [team, orgUnit] = await Promise.all([
        ctx.db.get(placement.teamId),
        ctx.db.get(placement.orgUnitId),
      ]);
      results.push({ ...placement, teamName: team?.name, orgUnitName: orgUnit?.name, orgUnitType: orgUnit?.unitType });
    }
    return results;
  },
});

export const setTeamPlacement = mutation({
  args: {
    orgId: v.string(),
    seasonId: v.id("seasons"),
    teamId: v.id("teams"),
    orgUnitId: v.id("orgUnits"),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const [season, team, orgUnit] = await Promise.all([
      ctx.db.get(args.seasonId),
      ctx.db.get(args.teamId),
      ctx.db.get(args.orgUnitId),
    ]);
    if (!season || season.orgId !== args.orgId) throw new Error("Season not found in this org");
    if (!team || team.orgId !== args.orgId) throw new Error("Team not found in this org");
    if (!orgUnit || orgUnit.orgId !== args.orgId) throw new Error("Org unit not found in this org");

    const existing = await ctx.db
      .query("teamSeasonPlacements")
      .withIndex("by_org_and_team_and_season", (q) =>
        q.eq("orgId", args.orgId).eq("teamId", args.teamId).eq("seasonId", args.seasonId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { orgUnitId: args.orgUnitId });
      return existing._id;
    }
    return await ctx.db.insert("teamSeasonPlacements", {
      orgId: args.orgId,
      seasonId: args.seasonId,
      teamId: args.teamId,
      orgUnitId: args.orgUnitId,
    });
  },
});

export const removeTeamPlacement = mutation({
  args: { orgId: v.string(), seasonId: v.id("seasons"), teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const existing = await ctx.db
      .query("teamSeasonPlacements")
      .withIndex("by_org_and_team_and_season", (q) =>
        q.eq("orgId", args.orgId).eq("teamId", args.teamId).eq("seasonId", args.seasonId)
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const copyPlacementsFromPreviousSeason = mutation({
  args: { orgId: v.string(), seasonId: v.id("seasons"), fromSeasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const [season, fromSeason] = await Promise.all([ctx.db.get(args.seasonId), ctx.db.get(args.fromSeasonId)]);
    if (!season || season.orgId !== args.orgId) throw new Error("Season not found in this org");
    if (!fromSeason || fromSeason.orgId !== args.orgId) throw new Error("Source season not found in this org");

    const sourcePlacements = await ctx.db
      .query("teamSeasonPlacements")
      .withIndex("by_org_and_season_and_orgUnit", (q) => q.eq("orgId", args.orgId).eq("seasonId", args.fromSeasonId))
      .collect();

    let copied = 0;
    for (const placement of sourcePlacements) {
      const existing = await ctx.db
        .query("teamSeasonPlacements")
        .withIndex("by_org_and_team_and_season", (q) =>
          q.eq("orgId", args.orgId).eq("teamId", placement.teamId).eq("seasonId", args.seasonId)
        )
        .unique();
      if (existing) continue; // don't clobber a placement already set for the destination season

      await ctx.db.insert("teamSeasonPlacements", {
        orgId: args.orgId,
        seasonId: args.seasonId,
        teamId: placement.teamId,
        orgUnitId: placement.orgUnitId,
      });
      copied++;
    }
    return { copied };
  },
});
