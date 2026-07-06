import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireLeagueAdminMutation, requireLeagueAdminQuery } from "./lib/auth";

/**
 * Replaces Clerk's Organization Invitation feature. The Next.js API route
 * that calls this also fires a plain Clerk *account* invite email (not an
 * org invite) — this row is what actually carries the org + role
 * assignment, since Clerk has no concept of an org for us to attach it to.
 */
export const createInvite = mutation({
  args: {
    orgId: v.id("organizations"),
    email: v.string(),
    roles: v.array(v.string()),
  },
  handler: async (ctx, { orgId, email, roles }) => {
    const identity = await requireLeagueAdminMutation(ctx, orgId);
    const normalizedEmail = email.trim().toLowerCase();

    const existingPending = await ctx.db
      .query("orgInvitations")
      .withIndex("by_email_and_status", (q) => q.eq("email", normalizedEmail).eq("status", "pending"))
      .collect();
    for (const inv of existingPending.filter((i) => i.orgId === orgId)) {
      await ctx.db.patch(inv._id, { status: "revoked" });
    }

    return await ctx.db.insert("orgInvitations", {
      orgId,
      email: normalizedEmail,
      roles,
      invitedByClerkId: identity.subject,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const listInvites = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    const identity = await requireLeagueAdminQuery(ctx, orgId);
    if (!identity) return null;
    return await ctx.db
      .query("orgInvitations")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const revokeInvite = mutation({
  args: { invitationId: v.id("orgInvitations") },
  handler: async (ctx, { invitationId }) => {
    const invite = await ctx.db.get(invitationId);
    if (!invite) throw new Error("Invitation not found");
    await requireLeagueAdminMutation(ctx, invite.orgId);
    await ctx.db.patch(invitationId, { status: "revoked" });
  },
});

/**
 * Called right after sign-in/sign-up (see app layout / dashboard entry
 * point). Matches the caller's own verified email against any pending
 * invitations and materializes the corresponding orgMemberships. Safe to
 * call repeatedly — already-accepted/revoked invites are skipped.
 */
export const acceptMyPendingInvites = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.email) return { accepted: 0 };

    const normalizedEmail = identity.email.trim().toLowerCase();
    const pending = await ctx.db
      .query("orgInvitations")
      .withIndex("by_email_and_status", (q) => q.eq("email", normalizedEmail).eq("status", "pending"))
      .collect();

    let accepted = 0;
    for (const invite of pending) {
      const existing = await ctx.db
        .query("orgMemberships")
        .withIndex("by_org_and_clerk_id", (q) => q.eq("orgId", invite.orgId).eq("clerkId", identity.subject))
        .unique();

      if (existing) {
        const mergedRoles = Array.from(new Set([...existing.roles, ...invite.roles]));
        await ctx.db.patch(existing._id, { roles: mergedRoles, status: "active" });
      } else {
        await ctx.db.insert("orgMemberships", {
          clerkId: identity.subject,
          orgId: invite.orgId,
          roles: invite.roles,
          status: "active",
        });
      }

      await ctx.db.patch(invite._id, { status: "accepted" });
      accepted++;
    }

    return { accepted };
  },
});
