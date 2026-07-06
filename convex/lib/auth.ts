import type { MutationCtx, QueryCtx } from "../_generated/server";

function hasAnyRole(roles: string[] | undefined, allowed: string[]): boolean {
  return !!roles?.some((r) => allowed.includes(r));
}

async function getMembershipRoles(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  clerkId: string
): Promise<string[] | undefined> {
  const membership = await ctx.db
    .query("orgMemberships")
    .withIndex("by_org_and_clerk_id", (q) => q.eq("orgId", orgId).eq("clerkId", clerkId))
    .unique();
  return membership?.roles;
}

/**
 * Query-side gate: never throws, on a missing identity OR a role mismatch —
 * both return null. Throwing on missing identity leaves useQuery permanently
 * stuck in an error state during the auth-token-arrival race on page load;
 * throwing on a role mismatch surfaces as an unhandled runtime error overlay
 * instead of the graceful "no access" UI callers are built to render for a
 * null result. Callers already do `if (!identity) return null`, so this is a
 * transparent, backward-compatible fix at the gate level only.
 *
 * Role resolution is a single indexed `orgMemberships` read, not a JWT fast
 * path — Convex queries already require `orgId` as an explicit client-
 * supplied argument (there's no implicit "active org" server-side), so the
 * indexed lookup is effectively free relative to serving the request at all.
 */
export async function requireLeagueAdminQuery(ctx: QueryCtx, orgId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["league_admin", "super_admin"])) return null;

  return identity;
}

/**
 * Mutation-side gate: same role check, but throwing is fine here — mutations
 * aren't subject to the useQuery stuck-error problem, and every caller
 * already wraps its mutation call in a try/catch with error-state UI.
 */
export async function requireLeagueAdminMutation(ctx: MutationCtx, orgId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["league_admin", "super_admin"])) throw new Error("Forbidden");

  return identity;
}

/**
 * Query-side gate for referee-only reads: never throws, same null-on-missing-identity-
 * or-wrong-role pattern as requireLeagueAdminQuery.
 */
export async function requireRefereeQuery(ctx: QueryCtx, orgId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["referee"])) return null;

  return identity;
}

/**
 * Mutation-side gate for referee-only writes: role check only. Per-record ownership
 * (e.g. is this game actually assigned to this referee) is checked inline by the caller.
 */
export async function requireRefereeMutation(ctx: MutationCtx, orgId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["referee"])) throw new Error("Forbidden");

  return identity;
}

/**
 * Query-side gate for coach-only reads: never throws, same null-on-missing-identity-
 * or-wrong-role pattern as requireLeagueAdminQuery.
 */
export async function requireCoachQuery(ctx: QueryCtx, orgId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["coach"])) return null;

  return identity;
}

/**
 * Mutation-side gate for coach-only writes: role check only. Per-record ownership
 * (e.g. is this game's team actually one of this coach's teams) is checked inline
 * by the caller.
 */
export async function requireCoachMutation(ctx: MutationCtx, orgId: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["coach"])) throw new Error("Forbidden");

  return identity;
}

/**
 * Cross-org platform-operator check: super_admin is a global capability (not
 * scoped to the active org), so this checks whether the caller holds
 * super_admin in ANY org membership rather than a specific orgId. Used by
 * impersonation and org-creation, which must work before an org is selected.
 */
export async function requireSuperAdminMutation(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const memberships = await ctx.db
    .query("orgMemberships")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .collect();
  if (!memberships.some((m) => m.roles.includes("super_admin"))) throw new Error("Forbidden");

  return identity;
}

/** Query-side counterpart to requireSuperAdminMutation — never throws, returns null instead. */
export async function requireSuperAdminQuery(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const memberships = await ctx.db
    .query("orgMemberships")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .collect();
  if (!memberships.some((m) => m.roles.includes("super_admin"))) return null;

  return identity;
}
