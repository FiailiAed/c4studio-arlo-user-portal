import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Query-side gate: returns null (never throws) when identity is absent,
 * since throwing leaves useQuery permanently stuck in an error state during
 * the auth-token-arrival race on page load. Throws "Forbidden" only once
 * identity is confirmed present but the role check fails.
 */
export async function requireLeagueAdminQuery(ctx: QueryCtx) {
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
export async function requireLeagueAdminMutation(ctx: MutationCtx) {
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
