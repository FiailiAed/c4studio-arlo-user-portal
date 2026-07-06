import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";
import { SLOT_MS } from "./games";

export const getAvailableRefs = query({
  args: { orgId: v.string(), gameId: v.id("games") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const game = await ctx.db.get(args.gameId);
    if (!game || game.orgId !== args.orgId) return null;

    const memberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();

    const referees = (
      await Promise.all(
        memberships
          .filter((m) => m.roles.includes("referee"))
          .map((m) =>
            ctx.db
              .query("users")
              .withIndex("by_clerk_id", (q) => q.eq("clerkId", m.clerkId))
              .unique()
          )
      )
    ).filter((u): u is NonNullable<typeof u> => u !== null);

    const allGames = await ctx.db
      .query("games")
      .withIndex("by_org_and_start_time", (q) => q.eq("orgId", args.orgId))
      .collect();

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
    orgId: v.string(),
    gameId: v.id("games"),
    refereeClerkId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const game = await ctx.db.get(args.gameId);
    if (!game || game.orgId !== args.orgId) throw new Error("Game not found");

    await ctx.db.patch(args.gameId, { refereeId: args.refereeClerkId, refereeAccepted: false });
  },
});

export const unassignReferee = mutation({
  args: { orgId: v.string(), gameId: v.id("games") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const game = await ctx.db.get(args.gameId);
    if (!game || game.orgId !== args.orgId) throw new Error("Game not found");

    await ctx.db.patch(args.gameId, { refereeId: undefined, refereeAccepted: undefined });
  },
});
