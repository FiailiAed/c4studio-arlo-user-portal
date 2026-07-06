import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listOpenDisputes = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const openDisputes = await ctx.db
      .query("disputes")
      .withIndex("by_org_and_status", (q) => q.eq("orgId", args.orgId).eq("status", "OPEN"))
      .collect();

    const results = [];
    for (const dispute of openDisputes) {
      const [game, raisedBy] = await Promise.all([
        ctx.db.get(dispute.gameId),
        ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", dispute.raisedByClerkId))
          .unique(),
      ]);
      const [homeTeam, awayTeam] = game
        ? await Promise.all([ctx.db.get(game.homeTeamId), ctx.db.get(game.awayTeamId)])
        : [null, null];

      results.push({
        ...dispute,
        gameMatchup: game ? `${homeTeam?.name ?? "Unknown"} vs ${awayTeam?.name ?? "Unknown"}` : "Unknown game",
        gameStartTime: game?.startTime,
        currentHomeScore: game?.homeScore,
        currentAwayScore: game?.awayScore,
        raisedByName: raisedBy
          ? `${raisedBy.firstName ?? ""} ${raisedBy.lastName ?? ""}`.trim() || raisedBy.email || dispute.raisedByClerkId
          : dispute.raisedByClerkId,
      });
    }
    return results;
  },
});

export const resolveDispute = mutation({
  args: {
    orgId: v.string(),
    disputeId: v.id("disputes"),
    resolutionNotes: v.string(),
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminMutation(ctx, args.orgId);

    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute || dispute.orgId !== args.orgId) throw new Error("Dispute not found");
    if (dispute.status !== "OPEN") throw new Error("Dispute is already resolved");

    const game = await ctx.db.get(dispute.gameId);
    if (!game) throw new Error("Game not found");

    await ctx.db.patch(dispute.gameId, {
      ...(args.homeScore !== undefined ? { homeScore: args.homeScore } : {}),
      ...(args.awayScore !== undefined ? { awayScore: args.awayScore } : {}),
      status: "COMPLETED_WITH_SCORE",
    });

    await ctx.db.patch(args.disputeId, {
      status: "RESOLVED",
      resolutionNotes: args.resolutionNotes,
      resolvedByClerkId: identity.subject,
      resolvedAt: Date.now(),
    });
  },
});
