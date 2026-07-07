import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listTeams = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    return await ctx.db
      .query("teams")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
  },
});

export const createTeam = mutation({
  args: {
    orgId: v.id("organizations"),
    name: v.string(),
    clubId: v.optional(v.id("clubs")),
    orgUnitId: v.id("orgUnits"),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    if (args.clubId) {
      const club = await ctx.db.get(args.clubId);
      if (!club || club.orgId !== args.orgId) throw new Error("Club not found");
    }

    const orgUnit = await ctx.db.get(args.orgUnitId);
    if (!orgUnit || orgUnit.orgId !== args.orgId) throw new Error("Org unit not found");

    return await ctx.db.insert("teams", {
      orgId: args.orgId,
      name: args.name,
      clubId: args.clubId,
      orgUnitId: args.orgUnitId,
    });
  },
});

/** Places (or reassigns) an existing team within the org hierarchy. */
export const assignTeamOrgUnit = mutation({
  args: { teamId: v.id("teams"), orgUnitId: v.id("orgUnits") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    await requireLeagueAdminMutation(ctx, team.orgId);

    const orgUnit = await ctx.db.get(args.orgUnitId);
    if (!orgUnit || orgUnit.orgId !== team.orgId) throw new Error("Org unit not found");

    await ctx.db.patch(args.teamId, { orgUnitId: args.orgUnitId });
  },
});

export const assignTeamToClub = mutation({
  args: {
    teamId: v.id("teams"),
    clubId: v.optional(v.id("clubs")),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    await requireLeagueAdminMutation(ctx, team.orgId);

    if (args.clubId) {
      const club = await ctx.db.get(args.clubId);
      if (!club || club.orgId !== team.orgId) throw new Error("Club not found");
    }

    await ctx.db.patch(args.teamId, { clubId: args.clubId });
  },
});

export const renameTeam = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    await requireLeagueAdminMutation(ctx, team.orgId);

    await ctx.db.patch(args.teamId, { name: args.name });
  },
});

export const deleteTeam = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    await requireLeagueAdminMutation(ctx, team.orgId);

    const games = await ctx.db
      .query("games")
      .withIndex("by_org_and_start_time", (q) => q.eq("orgId", team.orgId))
      .collect();
    const referenced = games.some(
      (game) => game.homeTeamId === args.teamId || game.awayTeamId === args.teamId
    );
    if (referenced) throw new Error("Team has scheduled games");

    await ctx.db.delete(args.teamId);
  },
});
