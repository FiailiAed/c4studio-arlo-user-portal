import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import {
  requireLeagueAdminMutation,
  requireLeagueAdminQuery,
  requireRefereeMutation,
  requireRefereeQuery,
} from "./lib/auth";
import type { Id } from "./_generated/dataModel";

// Games occupy a fixed 2-hour slot on a field; no separate duration field yet.
export const SLOT_MS = 2 * 60 * 60 * 1000;

async function assertNoFieldConflict(
  ctx: QueryCtx,
  fieldId: Id<"fields">,
  startTime: number,
  excludeGameId?: Id<"games">
) {
  const gamesOnField = await ctx.db
    .query("games")
    .withIndex("by_field_and_time", (q) => q.eq("fieldId", fieldId))
    .collect();

  const conflict = gamesOnField.some(
    (game) =>
      game._id !== excludeGameId &&
      game.status !== "CANCELLED" &&
      Math.abs(game.startTime - startTime) < SLOT_MS
  );

  if (conflict) throw new Error("Field is already booked at this time");
}

export const listGames = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    const allGames = await ctx.db.query("games").withIndex("by_start_time", (q) => q).collect();
    const games = allGames.filter(
      (game) =>
        (args.from === undefined || game.startTime >= args.from) &&
        (args.to === undefined || game.startTime <= args.to)
    );

    const results = [];
    for (const game of games) {
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

export const createGame = mutation({
  args: {
    homeTeamId: v.id("teams"),
    awayTeamId: v.id("teams"),
    fieldId: v.id("fields"),
    startTime: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminMutation(ctx);

    await assertNoFieldConflict(ctx, args.fieldId, args.startTime);

    return await ctx.db.insert("games", {
      homeTeamId: args.homeTeamId,
      awayTeamId: args.awayTeamId,
      fieldId: args.fieldId,
      startTime: args.startTime,
      status: "PENDING_ASSIGNMENT",
      createdBy: identity.subject,
    });
  },
});

export const updateGameSlot = mutation({
  args: {
    gameId: v.id("games"),
    fieldId: v.optional(v.id("fields")),
    startTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    const nextFieldId = args.fieldId ?? game.fieldId;
    const nextStartTime = args.startTime ?? game.startTime;

    await assertNoFieldConflict(ctx, nextFieldId, nextStartTime, args.gameId);

    await ctx.db.patch(args.gameId, { fieldId: nextFieldId, startTime: nextStartTime });
  },
});

export const cancelGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    await ctx.db.patch(args.gameId, { status: "CANCELLED" });
  },
});

export const listMyAssignedGames = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireRefereeQuery(ctx);
    if (!identity) return null;

    const games = await ctx.db
      .query("games")
      .withIndex("by_referee", (q) => q.eq("refereeId", identity.subject))
      .collect();

    const results = [];
    for (const game of games) {
      const [homeTeam, awayTeam, field] = await Promise.all([
        ctx.db.get(game.homeTeamId),
        ctx.db.get(game.awayTeamId),
        ctx.db.get(game.fieldId),
      ]);
      results.push({
        ...game,
        homeTeamName: homeTeam?.name ?? "Unknown team",
        awayTeamName: awayTeam?.name ?? "Unknown team",
        fieldName: field?.name ?? "Unknown field",
      });
    }
    return results;
  },
});

export const acceptGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const identity = await requireRefereeMutation(ctx);

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.refereeId !== identity.subject) throw new Error("Forbidden");

    await ctx.db.patch(args.gameId, { refereeAccepted: true, status: "REF_ASSIGNED" });
  },
});

export const submitScore = mutation({
  args: {
    gameId: v.id("games"),
    homeScore: v.number(),
    awayScore: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireRefereeMutation(ctx);

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.refereeId !== identity.subject) throw new Error("Forbidden");
    if (game.status !== "REF_ASSIGNED") throw new Error("Game is not ready for a score");

    await ctx.db.patch(args.gameId, {
      homeScore: args.homeScore,
      awayScore: args.awayScore,
      scoreVerified: false,
      status: "COMPLETED_WITH_SCORE",
    });
  },
});
