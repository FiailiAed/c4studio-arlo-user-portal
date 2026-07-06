import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listRosterForTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;

    const identity = await requireLeagueAdminQuery(ctx, team.orgId);
    if (!identity) return null;

    const rosterRows = await ctx.db
      .query("rosters")
      .withIndex("by_org_and_team", (q) => q.eq("orgId", team.orgId).eq("teamId", args.teamId))
      .collect();

    const results = [];
    for (const row of rosterRows) {
      const player = await ctx.db.get(row.playerId);
      if (!player) continue;
      results.push({ ...row, player });
    }
    return results;
  },
});

export const addToRoster = mutation({
  args: {
    teamId: v.id("teams"),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    await requireLeagueAdminMutation(ctx, team.orgId);

    const player = await ctx.db.get(args.playerId);
    if (!player || player.orgId !== team.orgId) throw new Error("Player not found");

    const existing = await ctx.db
      .query("rosters")
      .withIndex("by_org_and_team", (q) => q.eq("orgId", team.orgId).eq("teamId", args.teamId))
      .collect();
    if (existing.some((r) => r.playerId === args.playerId)) {
      throw new Error("Player is already on this team's roster");
    }

    return await ctx.db.insert("rosters", { orgId: team.orgId, teamId: args.teamId, playerId: args.playerId });
  },
});

export const removeFromRoster = mutation({
  args: { rosterId: v.id("rosters") },
  handler: async (ctx, args) => {
    const roster = await ctx.db.get(args.rosterId);
    if (!roster) throw new Error("Roster entry not found");

    await requireLeagueAdminMutation(ctx, roster.orgId);

    await ctx.db.delete(args.rosterId);
  },
});
