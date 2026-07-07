import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";
import { checkRosterEligibility } from "./residency";

export const listRosterForTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;

    const identity = await requireLeagueAdminQuery(ctx, team.orgId);
    if (!identity) return null;

    const rosterRows = await ctx.db
      .query("rosters")
      .withIndex("by_org_and_team", (q) => q.eq("orgId", team.orgId).eq("teamId", args.teamId))
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
    teamId: v.id("teams"),
    playerId: v.id("players"),
    // The league_admin escape hatch: if a residency check would otherwise
    // block this add, a non-empty reason here overrides it. Stored on the
    // roster row as an audit trail.
    overrideReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");

    const identity = await requireLeagueAdminMutation(ctx, team.orgId);

    const player = await ctx.db.get(args.playerId);
    if (!player || player.orgId !== team.orgId) throw new Error("Player not found");

    const existing = await ctx.db
      .query("rosters")
      .withIndex("by_org_and_team", (q) => q.eq("orgId", team.orgId).eq("teamId", args.teamId))
      .collect();
    if (existing.some((r) => r.playerId === args.playerId)) {
      throw new Error("Player is already on this team's roster");
    }

    // A team with no orgUnitId (legacy, pre-org-hierarchy row) has no
    // position to compare a resolved district against — the residency
    // check only activates once a team has been placed in the hierarchy.
    if (team.orgUnitId) {
      const eligibility = await checkRosterEligibility(ctx, {
        orgId: team.orgId,
        guardianClerkId: player.guardianClerkId,
        teamOrgUnitId: team.orgUnitId,
      });

      if (eligibility.status !== "match") {
        const reason = args.overrideReason?.trim();
        if (!reason) {
          if (eligibility.status === "not_resolved") throw new Error("DISTRICT_NOT_RESOLVED");
          if (eligibility.status === "unmapped") throw new Error("DISTRICT_UNMAPPED");
          throw new Error("DISTRICT_MISMATCH");
        }
        return await ctx.db.insert("rosters", {
          orgId: team.orgId,
          teamId: args.teamId,
          playerId: args.playerId,
          overrideReason: reason,
          overriddenByClerkId: identity.subject,
        });
      }
    }

    return await ctx.db.insert("rosters", { orgId: team.orgId, teamId: args.teamId, playerId: args.playerId });
  },
});

export const removeFromRoster = mutation({
  args: { rosterId: v.id("rosters") },
  handler: async (ctx, args) => {
    const roster = await ctx.db.get(args.rosterId);
    if (!roster) throw new Error("Roster entry not found");

    await requireLeagueAdminMutation(ctx, roster.orgId);

    await ctx.db.delete(args.rosterId);
  },
});
