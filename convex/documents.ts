import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

export const generateUploadUrl = mutation({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveDocumentMetadata = mutation({
  args: {
    orgId: v.string(),
    title: v.string(),
    storageId: v.id("_storage"),
    category: v.optional(v.string()),
    requiredForRoles: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminMutation(ctx, args.orgId);

    return await ctx.db.insert("documents", {
      orgId: args.orgId,
      title: args.title,
      storageId: args.storageId,
      category: args.category,
      requiredForRoles: args.requiredForRoles,
      uploadedByClerkId: identity.subject,
    });
  },
});

export const listDocuments = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const results = [];
    for (const doc of docs) {
      const [url, acks] = await Promise.all([
        ctx.storage.getUrl(doc.storageId),
        ctx.db
          .query("documentAcknowledgments")
          .withIndex("by_document", (q) => q.eq("documentId", doc._id))
          .collect(),
      ]);
      results.push({ ...doc, url, acknowledgmentCount: acks.length });
    }
    return results;
  },
});

export const deleteDocument = mutation({
  args: { orgId: v.string(), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.orgId !== args.orgId) throw new Error("Document not found");

    const acks = await ctx.db
      .query("documentAcknowledgments")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const ack of acks) {
      await ctx.db.delete(ack._id);
    }

    await ctx.storage.delete(doc.storageId);
    await ctx.db.delete(args.documentId);
  },
});

export const getMyRequiredDocuments = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const membership = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org_and_clerk_id", (q) => q.eq("orgId", args.orgId).eq("clerkId", identity.subject))
      .unique();
    const roles = membership?.roles ?? [];

    const allDocs = await ctx.db
      .query("documents")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const requiredDocs = allDocs.filter((doc) => doc.requiredForRoles.some((r) => roles.includes(r)));

    const results = [];
    for (const doc of requiredDocs) {
      const ack = await ctx.db
        .query("documentAcknowledgments")
        .withIndex("by_document", (q) => q.eq("documentId", doc._id))
        .filter((q) => q.eq(q.field("clerkId"), identity.subject))
        .unique();
      const url = await ctx.storage.getUrl(doc.storageId);
      results.push({ document: doc, url, acknowledged: !!ack });
    }
    return results;
  },
});

export const acknowledgeDocument = mutation({
  args: { orgId: v.string(), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.orgId !== args.orgId) throw new Error("Document not found");

    const existing = await ctx.db
      .query("documentAcknowledgments")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .filter((q) => q.eq(q.field("clerkId"), identity.subject))
      .unique();
    if (existing) return;

    await ctx.db.insert("documentAcknowledgments", {
      orgId: args.orgId,
      documentId: args.documentId,
      clerkId: identity.subject,
      acknowledgedAt: Date.now(),
    });
  },
});
