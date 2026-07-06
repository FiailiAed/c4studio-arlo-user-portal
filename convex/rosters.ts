import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listRosterForTeam = query({
  args: { orgId: v.string(), teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const rosterRows = await ctx.db
      .query("rosters")
      .withIndex("by_org_and_team", (q) => q.eq("orgId", args.orgId).eq("teamId", args.teamId))
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
    orgId: v.string(),
    teamId: v.id("teams"),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const existing = await ctx.db
      .query("rosters")
      .withIndex("by_org_and_team", (q) => q.eq("orgId", args.orgId).eq("teamId", args.teamId))
      .collect();
    if (existing.some((r) => r.playerId === args.playerId)) {
      throw new Error("Player is already on this team's roster");
    }

    return await ctx.db.insert("rosters", { orgId: args.orgId, teamId: args.teamId, playerId: args.playerId });
  },
});

export const removeFromRoster = mutation({
  args: { orgId: v.string(), rosterId: v.id("rosters") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const roster = await ctx.db.get(args.rosterId);
    if (!roster || roster.orgId !== args.orgId) throw new Error("Roster entry not found");

    await ctx.db.delete(args.rosterId);
  },
});
