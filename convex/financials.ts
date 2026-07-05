import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireLeagueAdminMutation, requireLeagueAdminQuery, requireRefereeQuery } from "./lib/auth";

const DEFAULT_REFEREE_PAY_RATE_CENTS = 5000; // $50/game
const PLATFORM_FEE_RATE = 0.015;

export const getLeagueSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    const settings = await ctx.db.query("leagueSettings").first();
    return settings ?? { refereePayRateCents: DEFAULT_REFEREE_PAY_RATE_CENTS };
  },
});

export const updateLeagueSettings = mutation({
  args: { refereePayRateCents: v.number() },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const existing = await ctx.db.query("leagueSettings").first();
    if (existing) {
      await ctx.db.patch(existing._id, { refereePayRateCents: args.refereePayRateCents });
    } else {
      await ctx.db.insert("leagueSettings", { refereePayRateCents: args.refereePayRateCents });
    }
  },
});

export const listReferees = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    const users = await ctx.db.query("users").collect();
    const referees = users.filter((u) => u.roles?.includes("referee"));

    const results = [];
    for (const referee of referees) {
      const profile = await ctx.db
        .query("refereeProfiles")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", referee.clerkId))
        .unique();
      results.push({
        ...referee,
        stripeConnectId: profile?.stripeConnectId,
        transfersActive: profile?.transfersActive,
      });
    }
    return results;
  },
});

export const setRefereeStripeAccount = mutation({
  args: {
    refereeClerkId: v.string(),
    stripeConnectId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const existing = await ctx.db
      .query("refereeProfiles")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.refereeClerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { stripeConnectId: args.stripeConnectId });
    } else {
      await ctx.db.insert("refereeProfiles", {
        clerkId: args.refereeClerkId,
        stripeConnectId: args.stripeConnectId,
      });
    }
  },
});

export const listPayoutLedger = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireLeagueAdminQuery(ctx);
    if (!identity) return null;

    const entries = await ctx.db.query("payoutLedger").collect();
    const results = [];
    for (const entry of entries) {
      const [game, referee] = await Promise.all([
        ctx.db.get(entry.gameId),
        ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", entry.refereeClerkId))
          .unique(),
      ]);
      const [homeTeam, awayTeam] = game
        ? await Promise.all([ctx.db.get(game.homeTeamId), ctx.db.get(game.awayTeamId)])
        : [null, null];
      results.push({
        ...entry,
        gameMatchup: game ? `${homeTeam?.name ?? "Unknown"} vs ${awayTeam?.name ?? "Unknown"}` : "Unknown game",
        gameStartTime: game?.startTime,
        refereeName: referee
          ? `${referee.firstName ?? ""} ${referee.lastName ?? ""}`.trim() || referee.email || entry.refereeClerkId
          : entry.refereeClerkId,
      });
    }
    return results;
  },
});

export const getMyPayoutHistory = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireRefereeQuery(ctx);
    if (!identity) return null;

    const entries = await ctx.db
      .query("payoutLedger")
      .withIndex("by_referee", (q) => q.eq("refereeClerkId", identity.subject))
      .collect();

    const results = [];
    for (const entry of entries) {
      const game = await ctx.db.get(entry.gameId);
      const [homeTeam, awayTeam] = game
        ? await Promise.all([ctx.db.get(game.homeTeamId), ctx.db.get(game.awayTeamId)])
        : [null, null];
      results.push({
        ...entry,
        gameMatchup: game ? `${homeTeam?.name ?? "Unknown"} vs ${awayTeam?.name ?? "Unknown"}` : "Unknown game",
        gameStartTime: game?.startTime,
      });
    }
    return results;
  },
});

export const retryPayout = mutation({
  args: { payoutLedgerId: v.id("payoutLedger") },
  handler: async (ctx, args) => {
    await requireLeagueAdminMutation(ctx);

    const entry = await ctx.db.get(args.payoutLedgerId);
    if (!entry) throw new Error("Payout entry not found");
    if (entry.status !== "FAILED") throw new Error("Only failed payouts can be retried");

    await ctx.db.delete(args.payoutLedgerId);
    await ctx.scheduler.runAfter(0, internal.financialsActions.triggerStripePayout, {
      gameId: entry.gameId,
    });
  },
});

export const getPayoutContext = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const ledgerEntry = await ctx.db
      .query("payoutLedger")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .first();
    if (!ledgerEntry) return null;

    const profile = await ctx.db
      .query("refereeProfiles")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", ledgerEntry.refereeClerkId))
      .unique();

    return { ledgerEntry, stripeConnectId: profile?.stripeConnectId };
  },
});

export const createPendingLedgerEntry = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("payoutLedger")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .first();
    if (existing) return existing._id;

    const game = await ctx.db.get(args.gameId);
    if (!game || !game.refereeId) return null;

    const settings = await ctx.db.query("leagueSettings").first();
    const grossAmountCents = settings?.refereePayRateCents ?? DEFAULT_REFEREE_PAY_RATE_CENTS;
    const platformFeeCents = Math.round(grossAmountCents * PLATFORM_FEE_RATE);
    const netAmountCents = grossAmountCents - platformFeeCents;

    return await ctx.db.insert("payoutLedger", {
      gameId: args.gameId,
      refereeClerkId: game.refereeId,
      grossAmountCents,
      platformFeeCents,
      netAmountCents,
      status: "PENDING",
    });
  },
});

export const recordPayoutResult = internalMutation({
  args: {
    gameId: v.id("games"),
    status: v.union(v.literal("PAID"), v.literal("FAILED")),
    stripeTransferId: v.optional(v.string()),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("payoutLedger")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .first();
    if (!entry) return;

    await ctx.db.patch(entry._id, {
      status: args.status,
      stripeTransferId: args.stripeTransferId,
      failureReason: args.failureReason,
    });
  },
});

export const getMyPayoutAccount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireRefereeQuery(ctx);
    if (!identity) return null;

    const profile = await ctx.db
      .query("refereeProfiles")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    return {
      stripeConnectId: profile?.stripeConnectId,
      transfersActive: profile?.transfersActive,
    };
  },
});

export const getMyRefereeContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await requireRefereeQuery(ctx);
    if (!identity) return null;

    const [user, profile] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique(),
      ctx.db
        .query("refereeProfiles")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique(),
    ]);

    return {
      clerkId: identity.subject,
      email: user?.email,
      stripeConnectId: profile?.stripeConnectId,
    };
  },
});

export const getRefereeStripeAccount = internalQuery({
  args: { refereeClerkId: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("refereeProfiles")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.refereeClerkId))
      .unique();
    return { stripeConnectId: profile?.stripeConnectId };
  },
});

export const savePayoutAccount = internalMutation({
  args: {
    clerkId: v.string(),
    stripeConnectId: v.optional(v.string()),
    transfersActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("refereeProfiles")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.stripeConnectId !== undefined ? { stripeConnectId: args.stripeConnectId } : {}),
        ...(args.transfersActive !== undefined ? { transfersActive: args.transfersActive } : {}),
      });
    } else {
      await ctx.db.insert("refereeProfiles", {
        clerkId: args.clerkId,
        stripeConnectId: args.stripeConnectId,
        transfersActive: args.transfersActive,
      });
    }
  },
});

export const assertLeagueAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await requireLeagueAdminQuery(ctx);
    return identity ? { clerkId: identity.subject } : null;
  },
});
