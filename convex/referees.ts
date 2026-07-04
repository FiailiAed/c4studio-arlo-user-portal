import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";
import { SLOT_MS } from "./games";

export const getAvailableRefs = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    const game = await ctx.db.get(args.gameId);
    if (!game) return null;

    const allUsers = await ctx.db.query("users").collect();
    const referees = allUsers.filter((u) => u.roles?.includes("referee"));

    const allGames = await ctx.db.query("games").collect();

    return referees.filter((referee) => {
      const hasConflict = allGames.some(
        (g) =>
          g._id !== args.gameId &&
          g.refereeId === referee.clerkId &&
          g.status !== "CANCELLED" &&
          Math.abs(g.startTime - game.startTime) < SLOT_MS
      );
      return !hasConflict;
    });
  },
});

export const assignReferee = mutation({
  args: {
    gameId: v.id("games"),
    refereeClerkId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    await ctx.db.patch(args.gameId, { refereeId: args.refereeClerkId, refereeAccepted: false });
  },
});

export const unassignReferee = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    await ctx.db.patch(args.gameId, { refereeId: undefined, refereeAccepted: undefined });
  },
});
