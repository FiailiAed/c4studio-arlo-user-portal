import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";
import { hasFieldConflict, SLOT_MS } from "./games";
import type { Id } from "./_generated/dataModel";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Standard circle-method round-robin: fix the first team, rotate the rest
 * each round. An odd team count gets a null "bye" slot so every real team
 * still sits out exactly one round rather than the algorithm breaking.
 * Returns one array of [teamA, teamB] pairs per round (byes omitted).
 */
function generateRoundRobinRounds(teamIds: Id<"teams">[]): [Id<"teams">, Id<"teams">][][] {
  const players: (Id<"teams"> | null)[] = [...teamIds];
  if (players.length % 2 !== 0) players.push(null);

  const n = players.length;
  const rounds: [Id<"teams">, Id<"teams">][][] = [];
  const rotating = players.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const round: [Id<"teams">, Id<"teams">][] = [];
    const arrangement = [players[0], ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = arrangement[i];
      const b = arrangement[n - 1 - i];
      if (a !== null && b !== null) round.push([a, b]);
    }
    rounds.push(round);
    rotating.unshift(rotating.pop()!);
  }

  return rounds;
}

function nextOccurrenceOfWeekday(fromMs: number, targetDayOfWeek: number): number {
  const d = new Date(fromMs);
  const diff = (targetDayOfWeek - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d.getTime();
}

function withTimeOfDay(dateMs: number, timeOfDay: string): number {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  const d = new Date(dateMs);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

export const previewRoundRobin = query({
  args: {
    orgId: v.string(),
    seasonId: v.id("seasons"),
    orgUnitId: v.id("orgUnits"),
    startDate: v.number(),
    dayOfWeek: v.number(), // 0 = Sunday .. 6 = Saturday
    timeOfDay: v.string(), // "HH:MM"
    fieldIds: v.array(v.id("fields")),
  },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    if (args.fieldIds.length === 0) throw new Error("Select at least one field");

    const placements = await ctx.db
      .query("teamSeasonPlacements")
      .withIndex("by_org_and_season_and_orgUnit", (q) =>
        q.eq("orgId", args.orgId).eq("seasonId", args.seasonId).eq("orgUnitId", args.orgUnitId)
      )
      .collect();
    if (placements.length < 2) throw new Error("Need at least 2 teams placed in this org unit for this season");

    const teamIds = placements.map((p) => p.teamId);
    const teamNames = new Map<Id<"teams">, string>();
    for (const teamId of teamIds) {
      const team = await ctx.db.get(teamId);
      teamNames.set(teamId, team?.name ?? "Unknown team");
    }
    const fieldNames = new Map<Id<"fields">, string>();
    for (const fieldId of args.fieldIds) {
      const field = await ctx.db.get(fieldId);
      fieldNames.set(fieldId, field?.name ?? "Unknown field");
    }

    const rounds = generateRoundRobinRounds(teamIds);
    const firstRoundDate = nextOccurrenceOfWeekday(args.startDate, args.dayOfWeek);

    const results = [];
    for (let r = 0; r < rounds.length; r++) {
      const roundDate = firstRoundDate + r * 7 * DAY_MS;
      const games = rounds[r];
      for (let g = 0; g < games.length; g++) {
        const [homeTeamId, awayTeamId] = games[g];
        const fieldId = args.fieldIds[g % args.fieldIds.length];
        const slotIndex = Math.floor(g / args.fieldIds.length);
        const startTime = withTimeOfDay(roundDate, args.timeOfDay) + slotIndex * SLOT_MS;

        const hasConflict = await hasFieldConflict(ctx, args.orgId, fieldId, startTime);

        results.push({
          round: r + 1,
          startTime,
          homeTeamId,
          homeTeamName: teamNames.get(homeTeamId) ?? "Unknown team",
          awayTeamId,
          awayTeamName: teamNames.get(awayTeamId) ?? "Unknown team",
          fieldId,
          fieldName: fieldNames.get(fieldId) ?? "Unknown field",
          hasConflict,
        });
      }
    }

    return results;
  },
});

export const commitRoundRobin = mutation({
  args: {
    orgId: v.string(),
    seasonId: v.id("seasons"),
    games: v.array(
      v.object({
        homeTeamId: v.id("teams"),
        awayTeamId: v.id("teams"),
        fieldId: v.id("fields"),
        startTime: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminMutation(ctx, args.orgId);

    const season = await ctx.db.get(args.seasonId);
    if (!season || season.orgId !== args.orgId) throw new Error("Season not found in this org");
    if (args.games.length === 0) throw new Error("No games to create");

    const insertedIds = [];
    for (const game of args.games) {
      if (await hasFieldConflict(ctx, args.orgId, game.fieldId, game.startTime)) {
        throw new Error("A proposed slot conflicts with an existing game — regenerate the preview and try again");
      }
      const id = await ctx.db.insert("games", {
        orgId: args.orgId,
        seasonId: args.seasonId,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        fieldId: game.fieldId,
        startTime: game.startTime,
        status: "PENDING_ASSIGNMENT",
        createdBy: identity.subject,
      });
      insertedIds.push(id);
    }
    return insertedIds;
  },
});
