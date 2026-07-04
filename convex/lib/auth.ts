import type { MutationCtx, QueryCtx } from "../_generated/server";

function hasAnyRole(roles: string[] | undefined, allowed: string[]): boolean {
  return !!roles?.some((r) => allowed.includes(r));
}

/**
 * Query-side gate: returns null (never throws) when identity is absent,
 * since throwing leaves useQuery permanently stuck in an error state during
 * the auth-token-arrival race on page load. Throws "Forbidden" only once
 * identity is confirmed present but the role check fails.
 */
export async function requireLeagueAdminQuery(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const jwtRoles = (identity["metadata"] as { roles?: string[] } | undefined)?.roles;

  if (!hasAnyRole(jwtRoles, ["league_admin", "super_admin"])) {
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!hasAnyRole(caller?.roles, ["league_admin", "super_admin"])) throw new Error("Forbidden");
  }

  return identity;
}

/**
 * Mutation-side gate: same role check, but throwing on missing identity is
 * fine here — mutations aren't subject to the useQuery stuck-error problem.
 */
export async function requireLeagueAdminMutation(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const jwtRoles = (identity["metadata"] as { roles?: string[] } | undefined)?.roles;

  if (!hasAnyRole(jwtRoles, ["league_admin", "super_admin"])) {
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!hasAnyRole(caller?.roles, ["league_admin", "super_admin"])) throw new Error("Forbidden");
  }

  return identity;
}

/**
 * Query-side gate for referee-only reads: role check only, same null-on-missing-identity
 * pattern as requireLeagueAdminQuery.
 */
export async function requireRefereeQuery(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const jwtRoles = (identity["metadata"] as { roles?: string[] } | undefined)?.roles;
  if (hasAnyRole(jwtRoles, ["referee"])) return identity;

  const caller = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!hasAnyRole(caller?.roles, ["referee"])) throw new Error("Forbidden");

  return identity;
}

/**
 * Mutation-side gate for referee-only writes: role check only. Per-record ownership
 * (e.g. is this game actually assigned to this referee) is checked inline by the caller.
 */
export async function requireRefereeMutation(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const jwtRoles = (identity["metadata"] as { roles?: string[] } | undefined)?.roles;
  if (hasAnyRole(jwtRoles, ["referee"])) return identity;

  const caller = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!hasAnyRole(caller?.roles, ["referee"])) throw new Error("Forbidden");

  return identity;
}
