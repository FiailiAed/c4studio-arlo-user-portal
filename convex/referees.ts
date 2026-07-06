import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";
import { SLOT_MS } from "./games";

export const getAvailableRefs = query({
  args: { orgId: v.id("organizations"), gameId: v.id("games") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const game = await ctx.db.get(args.gameId);
    if (!game || game.orgId !== args.orgId) return null;

    const memberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    const refereeMemberships = memberships.filter((m) => m.roles.includes("referee"));

    const users = await Promise.all(
      refereeMemberships.map((m) =>
        ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", m.clerkId))
          .unique()
      )
    );
    const referees = users.filter((u): u is NonNullable<typeof u> => u !== null);

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
    gameId: v.id("games"),
    refereeClerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    await requireLeagueAdminMutation(ctx, game.orgId);

    const membership = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org_and_clerk_id", (q) => q.eq("orgId", game.orgId).eq("clerkId", args.refereeClerkId))
      .unique();
    if (!membership || membership.status !== "active" || !membership.roles.includes("referee")) {
      throw new Error("Referee is not an active member of this organization");
    }

    await ctx.db.patch(args.gameId, { refereeId: args.refereeClerkId, refereeAccepted: false });
  },
});

export const unassignReferee = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    await requireLeagueAdminMutation(ctx, game.orgId);

    await ctx.db.patch(args.gameId, { refereeId: undefined, refereeAccepted: undefined });
  },
});
