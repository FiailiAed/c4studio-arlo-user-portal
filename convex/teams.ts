import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listTeams = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();

    const results = [];
    for (const team of teams) {
      const orgUnit = team.orgUnitId ? await ctx.db.get(team.orgUnitId) : null;
      results.push({ ...team, orgUnitName: orgUnit?.name, orgUnitType: orgUnit?.unitType });
    }
    return results;
  },
});

export const createTeam = mutation({
  args: {
    orgId: v.string(),
    name: v.string(),
    clubId: v.optional(v.id("clubs")),
    orgUnitId: v.id("orgUnits"),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const orgUnit = await ctx.db.get(args.orgUnitId);
    if (!orgUnit || orgUnit.orgId !== args.orgId) throw new Error("Org unit not found in this org");

    return await ctx.db.insert("teams", {
      orgId: args.orgId,
      name: args.name,
      clubId: args.clubId,
      orgUnitId: args.orgUnitId,
    });
  },
});

export const assignTeamOrgUnit = mutation({
  args: {
    orgId: v.string(),
    teamId: v.id("teams"),
    orgUnitId: v.id("orgUnits"),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== args.orgId) throw new Error("Team not found");

    const orgUnit = await ctx.db.get(args.orgUnitId);
    if (!orgUnit || orgUnit.orgId !== args.orgId) throw new Error("Org unit not found in this org");

    await ctx.db.patch(args.teamId, { orgUnitId: args.orgUnitId });
  },
});

export const assignTeamToClub = mutation({
  args: {
    orgId: v.string(),
    teamId: v.id("teams"),
    clubId: v.optional(v.id("clubs")),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== args.orgId) throw new Error("Team not found");

    await ctx.db.patch(args.teamId, { clubId: args.clubId });
  },
});

export const renameTeam = mutation({
  args: {
    orgId: v.string(),
    teamId: v.id("teams"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== args.orgId) throw new Error("Team not found");

    await ctx.db.patch(args.teamId, { name: args.name });
  },
});

export const deleteTeam = mutation({
  args: { orgId: v.string(), teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== args.orgId) throw new Error("Team not found");

    const games = await ctx.db
      .query("games")
      .withIndex("by_org_and_start_time", (q) => q.eq("orgId", args.orgId))
      .collect();
    const referenced = games.some(
      (game) => game.homeTeamId === args.teamId || game.awayTeamId === args.teamId
    );
    if (referenced) throw new Error("Team has scheduled games");

    await ctx.db.delete(args.teamId);
  },
});
