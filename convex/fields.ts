import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const listFields = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    return await ctx.db
      .query("fields")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
  },
});

export const createField = mutation({
  args: {
    orgId: v.id("organizations"),
    name: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    return await ctx.db.insert("fields", { orgId: args.orgId, name: args.name, location: args.location });
  },
});

export const renameField = mutation({
  args: {
    fieldId: v.id("fields"),
    name: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const field = await ctx.db.get(args.fieldId);
    if (!field) throw new Error("Field not found");

    await requireLeagueAdminMutation(ctx, field.orgId);

    await ctx.db.patch(args.fieldId, { name: args.name, location: args.location });
  },
});

export const deleteField = mutation({
  args: { fieldId: v.id("fields") },
  handler: async (ctx, args) => {
    const field = await ctx.db.get(args.fieldId);
    if (!field) throw new Error("Field not found");

    await requireLeagueAdminMutation(ctx, field.orgId);

    const gamesOnField = await ctx.db
      .query("games")
      .withIndex("by_org_and_field_and_time", (q) => q.eq("orgId", field.orgId).eq("fieldId", args.fieldId))
      .first();
    if (gamesOnField) throw new Error("Field has scheduled games");

    await ctx.db.delete(args.fieldId);
  },
});
