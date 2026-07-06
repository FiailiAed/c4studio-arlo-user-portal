import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminQuery } from "./lib/auth";

export const listAllPlayers = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    return await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("orgId"), args.orgId))
      .collect();
  },
});

export const listMyPlayers = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    // Return null rather than throw — Convex re-runs the query once the auth
    // token arrives. Throwing leaves useQuery permanently errored on fast loads.
    if (!identity) return null;

    return await ctx.db
      .query("players")
      .withIndex("by_guardian", (q) => q.eq("guardianClerkId", identity.subject))
      .filter((q) => q.eq(q.field("orgId"), args.orgId))
      .collect();
  },
});

export const createPlayer = mutation({
  args: {
    orgId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    dateOfBirth: v.string(),
    gender: v.optional(v.string()),
    school: v.optional(v.string()),
    grade: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    return await ctx.db.insert("players", {
      guardianClerkId: identity.subject,
      ...args,
    });
  },
});

export const updatePlayer = mutation({
  args: {
    orgId: v.string(),
    playerId: v.id("players"),
    firstName: v.string(),
    lastName: v.string(),
    dateOfBirth: v.string(),
    gender: v.optional(v.string()),
    school: v.optional(v.string()),
    grade: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const player = await ctx.db.get(args.playerId);
    if (!player) throw new Error("Player not found");
    if (player.guardianClerkId !== identity.subject) throw new Error("Forbidden");

    await ctx.db.patch(args.playerId, {
      firstName: args.firstName,
      lastName: args.lastName,
      dateOfBirth: args.dateOfBirth,
      gender: args.gender,
      school: args.school,
      grade: args.grade,
    });
  },
});

export const deletePlayer = mutation({
  args: {
    orgId: v.string(),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const player = await ctx.db.get(args.playerId);
    if (!player) throw new Error("Player not found");
    if (player.guardianClerkId !== identity.subject) throw new Error("Forbidden");

    await ctx.db.delete(args.playerId);
  },
});
