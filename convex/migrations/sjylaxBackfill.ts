/**
 * One-time SJYLAX-becomes-tenant-#1 backfill.
 *
 * IMPORTANT — read before running anything in here against real data:
 *
 * The old, pre-migration schema stored roles directly on `users.roles`.
 * That field no longer exists in this branch's schema (roles now live on
 * `orgMemberships`). That means the legacy role data MUST be captured
 * from production BEFORE this branch's schema is deployed there — once the
 * new schema.ts is pushed, any code that still expects `users.roles` will
 * simply not see it (Convex does not error on extra undeclared fields on
 * existing documents, but nothing in this new codebase reads that field
 * anymore, so it becomes silently unusable in practice).
 *
 * Execution order for a real cutover (none of this has been run yet):
 *   1. Against the CURRENT (pre-migration) production deployment, run a
 *      one-off export of `users` (e.g. `npx convex export` or a temporary
 *      query) and save the `{clerkId, roles}` pairs for every user that has
 *      a non-empty `roles` array. This is the `legacyUserRoles` input to
 *      step 4 below.
 *   2. Deploy this branch (new schema + functions) to that same production
 *      deployment.
 *   3. Call `createSjylaxOrg` once. Note the returned orgId.
 *   4. Call `backfillOrgId` with that orgId — patches every existing
 *      business-table row to carry it. Safe to re-run: it only touches rows
 *      where `orgId` is still absent.
 *   5. Call `createMembershipsFromLegacyRoles` with that orgId and the
 *      `legacyUserRoles` snapshot from step 1 — creates one orgMembership
 *      per legacy user with their prior roles preserved.
 *   6. Use the already-built `/admin/org-units` UI to hand-build out the
 *      real League -> Township -> Program -> Division -> Team tree (the 20+
 *      real townships aren't data this migration script has access to —
 *      that's an admin data-entry task, not something to hardcode here).
 *
 * `planBackfill` is read-only and safe to run at any time (before or after
 * deploy) to see exactly what step 4 would touch. Nothing in this file
 * mutates anything until `createSjylaxOrg` / `backfillOrgId` /
 * `createMembershipsFromLegacyRoles` are explicitly invoked.
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireSuperAdminMutation, requireSuperAdminQuery } from "../lib/auth";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const ORG_SCOPED_TABLES = [
  "players",
  "tableDefinitions",
  "customRecords",
  "fields",
  "teams",
  "games",
  "clubs",
  "rosters",
  "leagueSettings",
  "payoutLedger",
  "disputes",
  "documents",
  "documentAcknowledgments",
] as const;

/** Read-only: counts existing rows per table so you can see the blast radius before touching anything. */
export const planBackfill = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdminQuery(ctx);

    const counts: Record<string, number> = {};
    for (const table of ORG_SCOPED_TABLES) {
      counts[table] = (await ctx.db.query(table).collect()).length;
    }
    const userCount = (await ctx.db.query("users").collect()).length;
    const existingOrg = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", "sjylax"))
      .unique();

    return {
      rowCountsToBackfill: counts,
      totalUsers: userCount,
      sjylaxOrgAlreadyExists: existingOrg !== null,
      sjylaxOrgId: existingOrg?._id ?? null,
    };
  },
});

/** Step 3: create the SJYLAX tenant + a single root "League" org unit. Idempotent. */
export const createSjylaxOrg = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdminMutation(ctx);

    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", "sjylax"))
      .unique();
    if (existing) return existing._id;

    const orgId = await ctx.db.insert("organizations", {
      name: "South Jersey Youth Lacrosse League",
      slug: "sjylax",
      createdAt: Date.now(),
    });

    await ctx.db.insert("orgUnits", {
      orgId,
      parentUnitId: undefined,
      unitType: "League",
      name: "South Jersey Youth Lacrosse League",
      order: 0,
    });

    return orgId;
  },
});

async function backfillTable(ctx: MutationCtx, table: (typeof ORG_SCOPED_TABLES)[number], orgId: Id<"organizations">) {
  const rows = await ctx.db.query(table).collect();
  let patched = 0;
  for (const row of rows) {
    if (!("orgId" in row) || row.orgId === undefined) {
      await ctx.db.patch(row._id, { orgId });
      patched++;
    }
  }
  return patched;
}

/** Step 4: patch orgId onto every pre-existing business-data row. Safe to re-run. */
export const backfillOrgId = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    await requireSuperAdminMutation(ctx);

    const org = await ctx.db.get(orgId);
    if (!org) throw new Error("Org not found");

    const results: Record<string, number> = {};
    for (const table of ORG_SCOPED_TABLES) {
      results[table] = await backfillTable(ctx, table, orgId);
    }
    return results;
  },
});

/**
 * Step 5: given a snapshot of legacy {clerkId, roles} pairs captured from
 * production BEFORE this branch's schema was deployed there (see file
 * header), create one active orgMembership per user for the SJYLAX org.
 * Idempotent: merges roles into an existing membership rather than
 * duplicating.
 */
export const createMembershipsFromLegacyRoles = mutation({
  args: {
    orgId: v.id("organizations"),
    legacyUserRoles: v.array(v.object({ clerkId: v.string(), roles: v.array(v.string()) })),
  },
  handler: async (ctx, { orgId, legacyUserRoles }) => {
    await requireSuperAdminMutation(ctx);

    let created = 0;
    let merged = 0;
    for (const { clerkId, roles } of legacyUserRoles) {
      if (roles.length === 0) continue;

      const existing = await ctx.db
        .query("orgMemberships")
        .withIndex("by_org_and_clerk_id", (q) => q.eq("orgId", orgId).eq("clerkId", clerkId))
        .unique();

      if (existing) {
        const mergedRoles = Array.from(new Set([...existing.roles, ...roles]));
        await ctx.db.patch(existing._id, { roles: mergedRoles, status: "active" });
        merged++;
      } else {
        await ctx.db.insert("orgMemberships", { clerkId, orgId, roles, status: "active" });
        created++;
      }
    }

    return { created, merged };
  },
});
