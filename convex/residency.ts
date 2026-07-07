import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";
import { isSelfOrDescendant } from "./orgUnits";

/**
 * Free, no-API-key-required Census Bureau geocoder. Plain `fetch` — no
 * `"use node"` needed, this runs fine in Convex's default V8 action runtime.
 */
const CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

interface CensusGeography {
  NAME?: string;
  BASENAME?: string;
}

interface CensusGeocodeResponse {
  result?: {
    addressMatches?: {
      geographies?: Record<string, CensusGeography[]>;
    }[];
  };
}

export const getMyAddressForGeocode = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user?.address) return null;
    return { clerkId: identity.subject, address: user.address };
  },
});

export const saveResolvedDistrict = internalMutation({
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
    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      resolvedDistrict: {
        districtName: args.districtName,
        county: args.county,
        resolvedAt: Date.now(),
      },
    });
  },
});

/**
 * Geocodes the CALLER's own address (guardian's address is the source of
 * truth — there is no separate per-player address) and caches the result on
 * their user record. Must be an action, not a mutation: mutations must be
 * deterministic/no external I/O, so a live geocoding call cannot happen
 * inline inside the roster-assignment mutation — this is a hard Convex
 * platform constraint, not a stylistic choice. Enforcement (rosters.ts)
 * always reads the cached value written here.
 */
export const resolveMyDistrict = action({
  args: {},
  handler: async (ctx): Promise<{ districtName: string; county?: string }> => {
    const context = await ctx.runQuery(internal.residency.getMyAddressForGeocode, {});
    if (!context) throw new Error("Add your address to your profile before resolving your district");

    const { address } = context;
    const oneLine = `${address.street}, ${address.city}, ${address.state} ${address.zip}`;

    const url = new URL(CENSUS_GEOCODER_URL);
    url.searchParams.set("address", oneLine);
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("vintage", "Current_Current");
    url.searchParams.set("layers", "Secondary School Districts,Unified School Districts,Counties");
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error("Census geocoding service is unavailable right now");

    const data = (await response.json()) as CensusGeocodeResponse;
    const match = data.result?.addressMatches?.[0];
    if (!match) throw new Error("Couldn't resolve a district for that address — double check it on your profile");

    const geographies = match.geographies ?? {};
    const unified = geographies["Unified School Districts"]?.[0];
    const secondary = geographies["Secondary School Districts"]?.[0];
    const county = geographies["Counties"]?.[0];

    const districtName = (unified ?? secondary)?.NAME ?? (unified ?? secondary)?.BASENAME;
    if (!districtName) throw new Error("That address didn't resolve to a known school district");

    await ctx.runMutation(internal.residency.saveResolvedDistrict, {
      clerkId: context.clerkId,
      districtName,
      county: county?.NAME ?? county?.BASENAME,
    });

    return { districtName, county: county?.NAME ?? county?.BASENAME };
  },
});

export const listUnmappedReports = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    const identity = await requireLeagueAdminQuery(ctx, orgId);
    if (!identity) return null;
    return await ctx.db
      .query("unmappedDistrictReports")
      .withIndex("by_org_and_resolved", (q) => q.eq("orgId", orgId).eq("resolved", false))
      .collect();
  },
});

export const resolveUnmappedReport = mutation({
  args: { reportId: v.id("unmappedDistrictReports") },
  handler: async (ctx, { reportId }) => {
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error("Report not found");
    await requireLeagueAdminMutation(ctx, report.orgId);
    await ctx.db.patch(reportId, { resolved: true });
  },
});

export type EligibilityResult =
  | { status: "match" }
  | { status: "not_resolved" }
  | { status: "unmapped" }
  | { status: "mismatch"; mappedOrgUnitId: Id<"orgUnits"> };

/**
 * Plain shared helper (not a Convex function) — called directly from
 * rosters.addToRoster with the same mutation ctx, since mutations can't
 * runQuery/runMutation into other Convex functions the way actions can.
 * Reads the guardian's CACHED resolvedDistrict only; never geocodes live.
 */
export async function checkRosterEligibility(
  ctx: MutationCtx,
  args: { orgId: Id<"organizations">; guardianClerkId: string; teamOrgUnitId: Id<"orgUnits"> }
): Promise<EligibilityResult> {
  const guardian = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.guardianClerkId))
    .unique();

  const resolved = guardian?.resolvedDistrict;
  if (!resolved) return { status: "not_resolved" };

  const candidates = await ctx.db
    .query("districtMappings")
    .withIndex("by_org_and_district", (q) => q.eq("orgId", args.orgId).eq("districtName", resolved.districtName))
    .collect();

  const municipality = guardian?.address?.city;
  const mapping =
    candidates.find((m) => m.municipality !== undefined && m.municipality === municipality) ??
    candidates.find((m) => m.municipality === undefined);

  if (!mapping) {
    const existingReports = await ctx.db
      .query("unmappedDistrictReports")
      .withIndex("by_org_and_resolved", (q) => q.eq("orgId", args.orgId).eq("resolved", false))
      .collect();
    const alreadyLogged = existingReports.some(
      (r) => r.guardianClerkId === args.guardianClerkId && r.districtName === resolved.districtName
    );
    if (!alreadyLogged) {
      await ctx.db.insert("unmappedDistrictReports", {
        orgId: args.orgId,
        guardianClerkId: args.guardianClerkId,
        districtName: resolved.districtName,
        county: resolved.county,
        reportedAt: Date.now(),
        resolved: false,
      });
    }
    return { status: "unmapped" };
  }

  const inBounds = await isSelfOrDescendant(ctx, mapping.orgUnitId, args.teamOrgUnitId);
  if (!inBounds) return { status: "mismatch", mappedOrgUnitId: mapping.orgUnitId };

  return { status: "match" };
}
