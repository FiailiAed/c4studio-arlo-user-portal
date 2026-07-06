import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireCoachMutation, requireCoachQuery } from "./lib/auth";
import type { Doc, Id } from "./_generated/dataModel";

async function getMyTeams(ctx: QueryCtx, orgId: string, coachClerkId: string): Promise<Doc<"teams">[]> {
  const club = await ctx.db
    .query("clubs")
    .withIndex("by_coach", (q) => q.eq("coachClerkId", coachClerkId))
    .unique();
  if (!club || club.orgId !== orgId) return [];

  return await ctx.db
    .query("teams")
    .withIndex("by_club", (q) => q.eq("clubId", club._id))
    .collect();
}

export const getMyClub = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireCoachQuery(ctx, args.orgId);
    if (!identity) return null;

    const club = await ctx.db
      .query("clubs")
      .withIndex("by_coach", (q) => q.eq("coachClerkId", identity.subject))
      .unique();
    if (!club || club.orgId !== args.orgId) return null;

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_club", (q) => q.eq("clubId", club._id))
      .collect();

    return { club, teams };
  },
});

export const getMyRoster = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireCoachQuery(ctx, args.orgId);
    if (!identity) return null;

    const teams = await getMyTeams(ctx, args.orgId, identity.subject);

    const results = [];
    for (const team of teams) {
      const rosterRows = await ctx.db
        .query("rosters")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();
      for (const row of rosterRows) {
        const player = await ctx.db.get(row.playerId);
        if (!player) continue;
        results.push({ ...row, player, teamName: team.name });
      }
    }
    return results;
  },
});

export const getMySchedule = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireCoachQuery(ctx, args.orgId);
    if (!identity) return null;

    const teams = await getMyTeams(ctx, args.orgId, identity.subject);
    const teamIds = new Set(teams.map((t) => t._id));

    const allGames = await ctx.db
      .query("games")
      .withIndex("by_org_and_start_time", (q) => q.eq("orgId", args.orgId))
      .collect();
    const myGames = allGames.filter(
      (game) => teamIds.has(game.homeTeamId) || teamIds.has(game.awayTeamId)
    );

    const results = [];
    for (const game of myGames) {
      const [homeTeam, awayTeam, field, referee] = await Promise.all([
        ctx.db.get(game.homeTeamId),
        ctx.db.get(game.awayTeamId),
        ctx.db.get(game.fieldId),
        game.refereeId
          ? ctx.db
              .query("users")
              .withIndex("by_clerk_id", (q) => q.eq("clerkId", game.refereeId as string))
              .unique()
          : null,
      ]);
      results.push({
        ...game,
        homeTeamName: homeTeam?.name ?? "Unknown team",
        awayTeamName: awayTeam?.name ?? "Unknown team",
        fieldName: field?.name ?? "Unknown field",
        refereeName: referee ? `${referee.firstName ?? ""} ${referee.lastName ?? ""}`.trim() || referee.email : undefined,
      });
    }
    return results;
  },
});

export const verifyScore = mutation({
  args: { orgId: v.string(), gameId: v.id("games") },
  handler: async (ctx, args) => {
    const identity = await requireCoachMutation(ctx, args.orgId);

    const game = await ctx.db.get(args.gameId);
    if (!game || game.orgId !== args.orgId) throw new Error("Game not found");

    const teams = await getMyTeams(ctx, args.orgId, identity.subject);
    const teamIds = new Set<Id<"teams">>(teams.map((t) => t._id));
    if (!teamIds.has(game.homeTeamId) && !teamIds.has(game.awayTeamId)) {
      throw new Error("Forbidden");
    }
    if (game.status !== "COMPLETED_WITH_SCORE") throw new Error("Game does not have a score to verify");

    await ctx.db.patch(args.gameId, { scoreVerified: true });
  },
});

export const flagDispute = mutation({
  args: {
    orgId: v.string(),
    gameId: v.id("games"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireCoachMutation(ctx, args.orgId);

    const game = await ctx.db.get(args.gameId);
    if (!game || game.orgId !== args.orgId) throw new Error("Game not found");

    const teams = await getMyTeams(ctx, args.orgId, identity.subject);
    const teamIds = new Set<Id<"teams">>(teams.map((t) => t._id));
    if (!teamIds.has(game.homeTeamId) && !teamIds.has(game.awayTeamId)) {
      throw new Error("Forbidden");
    }
    if (game.status !== "COMPLETED_WITH_SCORE") throw new Error("Game does not have a score to dispute");

    await ctx.db.insert("disputes", {
      orgId: args.orgId,
      gameId: args.gameId,
      raisedByClerkId: identity.subject,
      reason: args.reason,
      status: "OPEN",
    });

    await ctx.db.patch(args.gameId, { status: "DISPUTED" });
  },
});
