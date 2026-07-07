import { internalMutation, internalQuery } from "../_generated/server";

const DEFAULT_SEASON_NAME = "Prior to Season Tracking";

/**
 * Read-only: reports exactly what backfillDefaultSeason would change, with
 * no writes. Generic across every org (not tied to one specific tenant) —
 * run this first and review before running the real thing.
 */
export const dryRunReport = internalQuery({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db.query("organizations").collect();
    const report: Record<string, { seasonlessGameCount: number; earliestStartTime?: number; latestStartTime?: number }> = {};

    for (const org of organizations) {
      const games = await ctx.db
        .query("games")
        .withIndex("by_org_and_start_time", (q) => q.eq("orgId", org.clerkOrgId))
        .collect();
      const seasonless = games.filter((g) => !g.seasonId);
      if (seasonless.length === 0) continue;

      report[org.clerkOrgId] = {
        seasonlessGameCount: seasonless.length,
        earliestStartTime: Math.min(...seasonless.map((g) => g.startTime)),
        latestStartTime: Math.max(...seasonless.map((g) => g.startTime)),
      };
    }

    return report;
  },
});

/**
 * For every org with seasonless games, creates one default season spanning
 * that org's existing game dates and stamps every seasonless game into it.
 * Idempotent — safe to re-run (an org with no seasonless games left is
 * skipped). Generic across all orgs, not SJYLAX-specific.
 */
export const backfillDefaultSeason = internalMutation({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db.query("organizations").collect();
    const results: Record<string, { seasonCreated: boolean; gamesStamped: number }> = {};

    for (const org of organizations) {
      const games = await ctx.db
        .query("games")
        .withIndex("by_org_and_start_time", (q) => q.eq("orgId", org.clerkOrgId))
        .collect();
      const seasonless = games.filter((g) => !g.seasonId);
      if (seasonless.length === 0) continue;

      const startDate = Math.min(...seasonless.map((g) => g.startTime));
      const endDate = Math.max(...seasonless.map((g) => g.startTime));

      const seasonId = await ctx.db.insert("seasons", {
        orgId: org.clerkOrgId,
        name: DEFAULT_SEASON_NAME,
        startDate,
        endDate,
      });

      for (const game of seasonless) {
        await ctx.db.patch(game._id, { seasonId });
      }

      results[org.clerkOrgId] = { seasonCreated: true, gamesStamped: seasonless.length };
    }

    return results;
  },
});
