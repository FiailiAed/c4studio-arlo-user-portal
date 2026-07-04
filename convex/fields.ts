import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listFields = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    return await ctx.db.query("fields").collect();
  },
});

export const createField = mutation({
  args: {
    name: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    return await ctx.db.insert("fields", { name: args.name, location: args.location });
  },
});

export const renameField = mutation({
  args: {
    fieldId: v.id("fields"),
    name: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const field = await ctx.db.get(args.fieldId);
    if (!field) throw new Error("Field not found");

    await ctx.db.patch(args.fieldId, { name: args.name, location: args.location });
  },
});

export const deleteField = mutation({
  args: { fieldId: v.id("fields") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const gamesOnField = await ctx.db
      .query("games")
      .withIndex("by_field_and_time", (q) => q.eq("fieldId", args.fieldId))
      .first();
    if (gamesOnField) throw new Error("Field has scheduled games");

    await ctx.db.delete(args.fieldId);
  },
});
