import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listTeams = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    return await ctx.db.query("teams").collect();
  },
});

export const createTeam = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    return await ctx.db.insert("teams", { name: args.name });
  },
});

export const renameTeam = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    await ctx.db.patch(args.teamId, { name: args.name });
  },
});

export const deleteTeam = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const games = await ctx.db.query("games").collect();
    const referenced = games.some(
      (game) => game.homeTeamId === args.teamId || game.awayTeamId === args.teamId
    );
    if (referenced) throw new Error("Team has scheduled games");

    await ctx.db.delete(args.teamId);
  },
});
