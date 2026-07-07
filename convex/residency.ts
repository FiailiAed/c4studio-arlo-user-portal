import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";
import type { Id } from "./_generated/dataModel";

async function resolveOrgUnitForDistrict(
  ctx: QueryCtx,
  orgId: string,
  districtName: string,
  municipality: string | undefined
): Promise<Id<"orgUnits"> | null> {
  const candidates = await ctx.db
    .query("districtMappings")
    .withIndex("by_org_and_district", (q) => q.eq("orgId", orgId).eq("districtName", districtName))
    .collect();
  if (candidates.length === 0) return null;

  if (municipality) {
    const municipalityMatch = candidates.find(
      (c) => c.municipality && c.municipality.toLowerCase() === municipality.toLowerCase()
    );
    if (municipalityMatch) return municipalityMatch.orgUnitId;
  }

  const direct = candidates.find((c) => !c.municipality);
  return direct ? direct.orgUnitId : null;
}

/**
 * Resolves the org unit covering a guardian's *cached* residency district —
 * reusable from convex/rosters.ts's addToRoster enforcement check. Returns
 * null if the guardian has no resolved residency yet, or the district has no
 * mapping in this org (both are "nothing to enforce against" cases, not
 * errors — the caller decides what that means).
 */
export async function resolveOrgUnitForResident(
  ctx: QueryCtx,
  orgId: string,
  guardianClerkId: string
): Promise<Id<"orgUnits"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", guardianClerkId))
    .unique();
  const districtName = user?.residency?.districtName;
  if (!districtName) return null;

  return resolveOrgUnitForDistrict(ctx, orgId, districtName, undefined);
}

export const getMyResidency = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    return user?.residency ?? null;
  },
});

export const getAddressForClerkId = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    return user?.address ?? null;
  },
});

export const saveResidency = internalMutation({
  args: {
    clerkId: v.string(),
    districtName: v.string(),
    county: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (!user) return;

    await ctx.db.patch(user._id, {
      residency: { districtName: args.districtName, county: args.county, resolvedAt: Date.now() },
    });
  },
});

export const lookupDistrictMapping = internalQuery({
  args: { orgId: v.string(), districtName: v.string(), municipality: v.optional(v.string()) },
  handler: async (ctx, args) => resolveOrgUnitForDistrict(ctx, args.orgId, args.districtName, args.municipality),
});

export const recordUnmappedDistrict = internalMutation({
  args: {
    orgId: v.string(),
    districtName: v.string(),
    county: v.optional(v.string()),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("unmappedDistrictReports")
      .withIndex("by_org_and_district", (q) => q.eq("orgId", args.orgId).eq("districtName", args.districtName))
      .first();
    if (existing) return;

    await ctx.db.insert("unmappedDistrictReports", {
      orgId: args.orgId,
      districtName: args.districtName,
      county: args.county,
      clerkId: args.clerkId,
      reportedAt: Date.now(),
    });
  },
});

/**
 * Resolves the caller's own address to a school sending-district via the
 * free US Census Bureau Geocoding API (no API key needed) and caches it.
 * A plain `fetch` action — no "use node" needed, same reasoning as the
 * Clerk Backend API calls in convex/organizations.ts's migration.
 */
export const resolveMyDistrict = action({
  args: { orgId: v.string() },
  handler: async (ctx, args): Promise<{ districtName: string; county?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const address = await ctx.runQuery(internal.residency.getAddressForClerkId, { clerkId: identity.subject });
    if (!address) throw new Error("No address on file — add one on your profile first");

    const fullAddress = `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
    const params = new URLSearchParams({
      address: fullAddress,
      benchmark: "Public_AR_Current",
      vintage: "Current_Current",
      layers: "Secondary School Districts,Unified School Districts,Counties",
      format: "json",
    });

    const res = await fetch(`https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?${params}`);
    if (!res.ok) throw new Error("Failed to reach the Census geocoder");
    const data = await res.json();

    const match = data?.result?.addressMatches?.[0];
    if (!match) throw new Error("Address not found by the Census geocoder — check it's a valid US address");

    const geographies = match.geographies ?? {};
    let districtName: string | undefined;
    if (geographies["Unified School Districts"]?.length > 0) {
      districtName = geographies["Unified School Districts"][0].NAME;
    }
    // Secondary (high) school districts take priority over unified ones, same as the reference lookup.
    if (geographies["Secondary School Districts"]?.length > 0) {
      districtName = geographies["Secondary School Districts"][0].NAME;
    }
    if (!districtName) throw new Error("No school district found for this address");

    const county: string | undefined = geographies["Counties"]?.[0]?.NAME;
    const municipality: string | undefined = match.addressComponents?.city;

    await ctx.runMutation(internal.residency.saveResidency, { clerkId: identity.subject, districtName, county });

    const orgUnitId = await ctx.runQuery(internal.residency.lookupDistrictMapping, {
      orgId: args.orgId,
      districtName,
      municipality,
    });
    if (!orgUnitId) {
      await ctx.runMutation(internal.residency.recordUnmappedDistrict, {
        orgId: args.orgId,
        districtName,
        county,
        clerkId: identity.subject,
      });
    }

    return { districtName, county };
  },
});

export const listDistrictMappings = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    const mappings = await ctx.db
      .query("districtMappings")
      .withIndex("by_org_and_district", (q) => q.eq("orgId", args.orgId))
      .collect();

    const results = [];
    for (const mapping of mappings) {
      const orgUnit = await ctx.db.get(mapping.orgUnitId);
      results.push({ ...mapping, orgUnitName: orgUnit?.name, orgUnitType: orgUnit?.unitType });
    }
    return results;
  },
});

export const createDistrictMapping = mutation({
  args: {
    orgId: v.string(),
    districtName: v.string(),
    municipality: v.optional(v.string()),
    orgUnitId: v.id("orgUnits"),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const orgUnit = await ctx.db.get(args.orgUnitId);
    if (!orgUnit || orgUnit.orgId !== args.orgId) throw new Error("Org unit not found in this org");

    return await ctx.db.insert("districtMappings", {
      orgId: args.orgId,
      districtName: args.districtName,
      municipality: args.municipality,
      orgUnitId: args.orgUnitId,
    });
  },
});

export const deleteDistrictMapping = mutation({
  args: { orgId: v.string(), mappingId: v.id("districtMappings") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx, args.orgId);

    const mapping = await ctx.db.get(args.mappingId);
    if (!mapping || mapping.orgId !== args.orgId) throw new Error("Mapping not found in this org");

    await ctx.db.delete(args.mappingId);
  },
});

export const listUnmappedDistrictReports = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireLeagueAdminQuery(ctx, args.orgId);
    if (!identity) return null;

    return await ctx.db
      .query("unmappedDistrictReports")
      .withIndex("by_org_and_district", (q) => q.eq("orgId", args.orgId))
      .collect();
  },
});
