import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listClubs = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    const clubs = await ctx.db.query("clubs").collect();
    const results = [];
    for (const club of clubs) {
      const coach = club.coachClerkId
        ? await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", club.coachClerkId as string))
            .unique()
        : null;
      results.push({
        ...club,
        coachName: coach ? `${coach.firstName ?? ""} ${coach.lastName ?? ""}`.trim() || coach.email : undefined,
      });
    }
    return results;
  },
});

export const getClub = query({
  args: { clubId: v.id("clubs") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    const club = await ctx.db.get(args.clubId);
    if (!club) return null;

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_club", (q) => q.eq("clubId", args.clubId))
      .collect();

    return { club, teams };
  },
});

export const listCoaches = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    const users = await ctx.db.query("users").collect();
    return users.filter((u) => u.roles?.includes("coach"));
  },
});

export const createClub = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    return await ctx.db.insert("clubs", { name: args.name });
  },
});

export const renameClub = mutation({
  args: {
    clubId: v.id("clubs"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const club = await ctx.db.get(args.clubId);
    if (!club) throw new Error("Club not found");

    await ctx.db.patch(args.clubId, { name: args.name });
  },
});

export const assignCoach = mutation({
  args: {
    clubId: v.id("clubs"),
    coachClerkId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const club = await ctx.db.get(args.clubId);
    if (!club) throw new Error("Club not found");

    await ctx.db.patch(args.clubId, { coachClerkId: args.coachClerkId });
  },
});

export const deleteClub = mutation({
  args: { clubId: v.id("clubs") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const teamsInClub = await ctx.db
      .query("teams")
      .withIndex("by_club", (q) => q.eq("clubId", args.clubId))
      .first();
    if (teamsInClub) throw new Error("Club has teams assigned to it");

    await ctx.db.delete(args.clubId);
  },
});
