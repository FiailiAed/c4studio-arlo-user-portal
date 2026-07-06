import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listClubs = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const clubs = await ctx.db
      .query("clubs")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const results = [];
    for (const club of clubs) {
      const [coach, orgUnit] = await Promise.all([
        club.coachClerkId
          ? ctx.db
              .query("users")
              .withIndex("by_clerk_id", (q) => q.eq("clerkId", club.coachClerkId as string))
              .unique()
          : null,
        club.orgUnitId ? ctx.db.get(club.orgUnitId) : null,
      ]);
      results.push({
        ...club,
        coachName: coach ? `${coach.firstName ?? ""} ${coach.lastName ?? ""}`.trim() || coach.email : undefined,
        orgUnitName: orgUnit?.name,
        orgUnitType: orgUnit?.unitType,
      });
    }
    return results;
  },
});

export const getClub = query({
  args: { orgId: v.string(), clubId: v.id("clubs") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const club = await ctx.db.get(args.clubId);
    if (!club || club.orgId !== args.orgId) return null;

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_club", (q) => q.eq("clubId", args.clubId))
      .collect();

    return { club, teams };
  },
});

export const listCoaches = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const memberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();

    const coaches = await Promise.all(
      memberships
        .filter((m) => m.roles.includes("coach"))
        .map((m) =>
          ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", m.clerkId))
            .unique()
        )
    );

    return coaches.filter((u): u is NonNullable<typeof u> => u !== null);
  },
});

export const createClub = mutation({
  args: { orgId: v.string(), name: v.string(), orgUnitId: v.id("orgUnits") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const orgUnit = await ctx.db.get(args.orgUnitId);
    if (!orgUnit || orgUnit.orgId !== args.orgId) throw new Error("Org unit not found in this org");

    return await ctx.db.insert("clubs", { orgId: args.orgId, name: args.name, orgUnitId: args.orgUnitId });
  },
});

export const assignClubOrgUnit = mutation({
  args: {
    orgId: v.string(),
    clubId: v.id("clubs"),
    orgUnitId: v.id("orgUnits"),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const club = await ctx.db.get(args.clubId);
    if (!club || club.orgId !== args.orgId) throw new Error("Club not found");

    const orgUnit = await ctx.db.get(args.orgUnitId);
    if (!orgUnit || orgUnit.orgId !== args.orgId) throw new Error("Org unit not found in this org");

    await ctx.db.patch(args.clubId, { orgUnitId: args.orgUnitId });
  },
});

export const renameClub = mutation({
  args: {
    orgId: v.string(),
    clubId: v.id("clubs"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const club = await ctx.db.get(args.clubId);
    if (!club || club.orgId !== args.orgId) throw new Error("Club not found");

    await ctx.db.patch(args.clubId, { name: args.name });
  },
});

export const assignCoach = mutation({
  args: {
    orgId: v.string(),
    clubId: v.id("clubs"),
    coachClerkId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const club = await ctx.db.get(args.clubId);
    if (!club || club.orgId !== args.orgId) throw new Error("Club not found");

    await ctx.db.patch(args.clubId, { coachClerkId: args.coachClerkId });
  },
});

export const deleteClub = mutation({
  args: { orgId: v.string(), clubId: v.id("clubs") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const club = await ctx.db.get(args.clubId);
    if (!club || club.orgId !== args.orgId) throw new Error("Club not found");

    const teamsInClub = await ctx.db
      .query("teams")
      .withIndex("by_club", (q) => q.eq("clubId", args.clubId))
      .first();
    if (teamsInClub) throw new Error("Club has teams assigned to it");

    await ctx.db.delete(args.clubId);
  },
});
