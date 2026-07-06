import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

function hasAnyRole(roles: string[] | undefined, allowed: string[]): boolean {
  return !!roles?.some((r) => allowed.includes(r));
}

/**
 * The only place role data is ever read from: a plain indexed Convex query
 * against orgMemberships. There is no JWT claim to shortcut through and no
 * mirror to go stale — this read is always the current, committed truth.
 */
async function getMembershipRoles(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  clerkId: string
): Promise<string[] | undefined> {
  const membership = await ctx.db
    .query("orgMemberships")
    .withIndex("by_org_and_clerk_id", (q) => q.eq("orgId", orgId).eq("clerkId", clerkId))
    .unique();
  if (!membership || membership.status !== "active") return undefined;
  return membership.roles;
}

/**
 * Query-side gate: returns null (never throws) when identity is absent,
 * since throwing leaves useQuery permanently stuck in an error state during
 * the auth-token-arrival race on page load. Throws "Forbidden" only once
 * identity is confirmed present but the role check fails.
 */
export async function requireLeagueAdminQuery(ctx: QueryCtx, orgId: Id<"organizations">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["league_admin", "super_admin"])) throw new Error("Forbidden");

  return identity;
}

/** Mutation-side gate: same role check, but throwing on missing identity is fine here. */
export async function requireLeagueAdminMutation(ctx: MutationCtx, orgId: Id<"organizations">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["league_admin", "super_admin"])) throw new Error("Forbidden");

  return identity;
}

export async function requireRefereeQuery(ctx: QueryCtx, orgId: Id<"organizations">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["referee", "league_admin", "super_admin"])) throw new Error("Forbidden");

  return identity;
}

export async function requireRefereeMutation(ctx: MutationCtx, orgId: Id<"organizations">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["referee", "league_admin", "super_admin"])) throw new Error("Forbidden");

  return identity;
}

export async function requireCoachQuery(ctx: QueryCtx, orgId: Id<"organizations">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["coach", "league_admin", "super_admin"])) throw new Error("Forbidden");

  return identity;
}

export async function requireCoachMutation(ctx: MutationCtx, orgId: Id<"organizations">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const roles = await getMembershipRoles(ctx, orgId, identity.subject);
  if (!hasAnyRole(roles, ["coach", "league_admin", "super_admin"])) throw new Error("Forbidden");

  return identity;
}

/**
 * super_admin is a cross-org, platform-operator capability (used by
 * impersonation and org creation, which by definition run before any single
 * org is "active"). This scans the caller's memberships across all orgs —
 * there is no per-org orgId to check against here.
 */
export async function requireSuperAdminQuery(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const memberships = await ctx.db
    .query("orgMemberships")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .collect();
  const isSuperAdmin = memberships.some(
    (m) => m.status === "active" && m.roles.includes("super_admin")
  );
  if (!isSuperAdmin) throw new Error("Forbidden");

  return identity;
}

export async function requireSuperAdminMutation(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const memberships = await ctx.db
    .query("orgMemberships")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .collect();
  const isSuperAdmin = memberships.some(
    (m) => m.status === "active" && m.roles.includes("super_admin")
  );
  if (!isSuperAdmin) throw new Error("Forbidden");

  return identity;
}
