import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminQuery } from "./lib/auth";

export const listAllPlayers = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    return await ctx.db
      .query("players")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
  },
});

export const listMyPlayers = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    // Return null rather than throw — Convex re-runs the query once the auth
    // token arrives. Throwing leaves useQuery permanently errored on fast loads.
    if (!identity) return null;

    return await ctx.db
      .query("players")
      .withIndex("by_org_and_guardian", (q) => q.eq("orgId", args.orgId).eq("guardianClerkId", identity.subject))
      .collect();
  },
});

export const createPlayer = mutation({
  args: {
    orgId: v.id("organizations"),
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

    const { playerId, ...fields } = args;
    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("Player not found");
    if (player.guardianClerkId !== identity.subject) throw new Error("Forbidden");

    await ctx.db.patch(playerId, fields);
  },
});

export const deletePlayer = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, { playerId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("Player not found");
    if (player.guardianClerkId !== identity.subject) throw new Error("Forbidden");

    await ctx.db.delete(playerId);
  },
});
