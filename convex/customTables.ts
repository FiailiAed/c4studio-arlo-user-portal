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
  args: { orgId: v.id("organizations") },
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
  args: { orgId: v.id("organizations"), tableId: v.id("tableDefinitions") },
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
    orgId: v.id("organizations"),
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
    tableId: v.id("tableDefinitions"),
    label: v.string(),
    type: columnType,
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");

    await requireLeagueAdminMutation(ctx, table.orgId);

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
    tableId: v.id("tableDefinitions"),
    key: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");

    await requireLeagueAdminMutation(ctx, table.orgId);

    const columns = table.columns.map((col) =>
      col.key === args.key ? { ...col, label: args.label } : col
    );

    await ctx.db.patch(args.tableId, { columns });
  },
});

export const deleteColumn = mutation({
  args: {
    tableId: v.id("tableDefinitions"),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");

    await requireLeagueAdminMutation(ctx, table.orgId);

    // Intentionally do not cascade-clean customRecords.data: orphaned
    // key/value pairs are inert and cheap to leave behind, and scrubbing
    // them would require an expensive fan-out mutation across every record.
    const columns = table.columns.filter((col) => col.key !== args.key);

    await ctx.db.patch(args.tableId, { columns });
  },
});

export const deleteTable = mutation({
  args: { tableId: v.id("tableDefinitions") },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");

    await requireLeagueAdminMutation(ctx, table.orgId);

    const records = await ctx.db
      .query("customRecords")
      .withIndex("by_org_and_table", (q) => q.eq("orgId", table.orgId).eq("tableId", args.tableId))
      .collect();

    for (const record of records) {
      await ctx.db.delete(record._id);
    }

    await ctx.db.delete(args.tableId);
  },
});

export const addRecord = mutation({
  args: {
    tableId: v.id("tableDefinitions"),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");

    await requireLeagueAdminMutation(ctx, table.orgId);

    return await ctx.db.insert("customRecords", {
      orgId: table.orgId,
      tableId: args.tableId,
      data: args.data,
    });
  },
});

export const updateRecord = mutation({
  args: {
    recordId: v.id("customRecords"),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record) throw new Error("Record not found");

    await requireLeagueAdminMutation(ctx, record.orgId);

    await ctx.db.patch(args.recordId, { data: args.data });
  },
});

export const deleteRecord = mutation({
  args: { recordId: v.id("customRecords") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record) throw new Error("Record not found");

    await requireLeagueAdminMutation(ctx, record.orgId);

    await ctx.db.delete(args.recordId);
  },
});
