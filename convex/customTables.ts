import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

const columnType = v.union(
  v.literal("text"),
  v.literal("number"),
  v.literal("date"),
  v.literal("boolean"),
  v.literal("select")
);

const columnInput = v.object({
  label: v.string(),
  type: columnType,
  options: v.optional(v.array(v.string())),
});

function generateColumnKey(index: number): string {
  return `col_${Date.now().toString(36)}${index}`;
}

export const listTables = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    return await ctx.db
      .query("tableDefinitions")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
  },
});

export const getTable = query({
  args: { orgId: v.string(), tableId: v.id("tableDefinitions") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const table = await ctx.db.get(args.tableId);
    if (!table || table.orgId !== args.orgId) return null;

    const records = await ctx.db
      .query("customRecords")
      .withIndex("by_org_and_table", (q) => q.eq("orgId", args.orgId).eq("tableId", args.tableId))
      .collect();

    return { table, records };
  },
});

export const createTable = mutation({
  args: {
    orgId: v.string(),
    name: v.string(),
    columns: v.array(columnInput),
  },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminMutation(ctx, args.orgId);

    const columns = args.columns.map((col, i) => ({
      key: generateColumnKey(i),
      label: col.label,
      type: col.type,
      options: col.options,
    }));

    return await ctx.db.insert("tableDefinitions", {
      orgId: args.orgId,
      name: args.name,
      createdBy: identity.subject,
      columns,
    });
  },
});

export const addColumn = mutation({
  args: {
    orgId: v.string(),
    tableId: v.id("tableDefinitions"),
    label: v.string(),
    type: columnType,
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const table = await ctx.db.get(args.tableId);
    if (!table || table.orgId !== args.orgId) throw new Error("Table not found");

    const newColumn = {
      key: generateColumnKey(table.columns.length),
      label: args.label,
      type: args.type,
      options: args.options,
    };

    await ctx.db.patch(args.tableId, {
      columns: [...table.columns, newColumn],
    });
  },
});

export const renameColumn = mutation({
  args: {
    orgId: v.string(),
    tableId: v.id("tableDefinitions"),
    key: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const table = await ctx.db.get(args.tableId);
    if (!table || table.orgId !== args.orgId) throw new Error("Table not found");

    const columns = table.columns.map((col) =>
      col.key === args.key ? { ...col, label: args.label } : col
    );

    await ctx.db.patch(args.tableId, { columns });
  },
});

export const deleteColumn = mutation({
  args: {
    orgId: v.string(),
    tableId: v.id("tableDefinitions"),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const table = await ctx.db.get(args.tableId);
    if (!table || table.orgId !== args.orgId) throw new Error("Table not found");

    // Intentionally do not cascade-clean customRecords.data: orphaned
    // key/value pairs are inert and cheap to leave behind, and scrubbing
    // them would require an expensive fan-out mutation across every record.
    const columns = table.columns.filter((col) => col.key !== args.key);

    await ctx.db.patch(args.tableId, { columns });
  },
});

export const deleteTable = mutation({
  args: { orgId: v.string(), tableId: v.id("tableDefinitions") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const table = await ctx.db.get(args.tableId);
    if (!table || table.orgId !== args.orgId) throw new Error("Table not found");

    const records = await ctx.db
      .query("customRecords")
      .withIndex("by_org_and_table", (q) => q.eq("orgId", args.orgId).eq("tableId", args.tableId))
      .collect();

    for (const record of records) {
      await ctx.db.delete(record._id);
    }

    await ctx.db.delete(args.tableId);
  },
});

export const addRecord = mutation({
  args: {
    orgId: v.string(),
    tableId: v.id("tableDefinitions"),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const table = await ctx.db.get(args.tableId);
    if (!table || table.orgId !== args.orgId) throw new Error("Table not found");

    return await ctx.db.insert("customRecords", {
      orgId: args.orgId,
      tableId: args.tableId,
      data: args.data,
    });
  },
});

export const updateRecord = mutation({
  args: {
    orgId: v.string(),
    recordId: v.id("customRecords"),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const record = await ctx.db.get(args.recordId);
    if (!record || record.orgId !== args.orgId) throw new Error("Record not found");

    await ctx.db.patch(args.recordId, { data: args.data });
  },
});

export const deleteRecord = mutation({
  args: { orgId: v.string(), recordId: v.id("customRecords") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const record = await ctx.db.get(args.recordId);
    if (!record || record.orgId !== args.orgId) throw new Error("Record not found");

    await ctx.db.delete(args.recordId);
  },
});
