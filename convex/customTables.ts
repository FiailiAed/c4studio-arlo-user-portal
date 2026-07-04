import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

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

/**
 * Query-side gate: mirrors users.listAll exactly. Returns null (never
 * throws) when identity is absent, since throwing leaves useQuery
 * permanently stuck in an error state during the auth-token-arrival race
 * on page load. Throws "Forbidden" only once identity is confirmed
 * present but the role check fails.
 */
async function requireLeagueAdminQuery(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const jwtRole = (identity["metadata"] as { role?: string } | undefined)?.role;

  if (jwtRole !== "league_admin" && jwtRole !== "super_admin") {
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (caller?.role !== "league_admin" && caller?.role !== "super_admin") throw new Error("Forbidden");
  }

  return identity;
}

/**
 * Mutation-side gate: same role check, but throwing on missing identity is
 * fine here — mutations aren't subject to the useQuery stuck-error problem.
 */
async function requireLeagueAdminMutation(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const jwtRole = (identity["metadata"] as { role?: string } | undefined)?.role;

  if (jwtRole !== "league_admin" && jwtRole !== "super_admin") {
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (caller?.role !== "league_admin" && caller?.role !== "super_admin") throw new Error("Forbidden");
  }

  return identity;
}

export const listTables = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    return await ctx.db.query("tableDefinitions").collect();
  },
});

export const getTable = query({
  args: { tableId: v.id("tableDefinitions") },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    const table = await ctx.db.get(args.tableId);
    if (!table) return null;

    const records = await ctx.db
      .query("customRecords")
      .withIndex("by_table", (q) => q.eq("tableId", args.tableId))
      .collect();

    return { table, records };
  },
});

export const createTable = mutation({
  args: {
    name: v.string(),
    columns: v.array(columnInput),
  },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminMutation(ctx);

    const columns = args.columns.map((col, i) => ({
      key: generateColumnKey(i),
      label: col.label,
      type: col.type,
      options: col.options,
    }));

    return await ctx.db.insert("tableDefinitions", {
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
    await requireLeagueAdminMutation(ctx);

    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");

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
    await requireLeagueAdminMutation(ctx);

    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");

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
    await requireLeagueAdminMutation(ctx);

    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");

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
    await requireLeagueAdminMutation(ctx);

    const records = await ctx.db
      .query("customRecords")
      .withIndex("by_table", (q) => q.eq("tableId", args.tableId))
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
    await requireLeagueAdminMutation(ctx);

    return await ctx.db.insert("customRecords", {
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
    await requireLeagueAdminMutation(ctx);

    await ctx.db.patch(args.recordId, { data: args.data });
  },
});

export const deleteRecord = mutation({
  args: { recordId: v.id("customRecords") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    await ctx.db.delete(args.recordId);
  },
});
