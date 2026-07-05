"use node";

import { v } from "convex/values";
import Stripe from "stripe";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(secretKey);
}

async function refreshAccountStatus(ctx: ActionCtx, clerkId: string, stripeConnectId: string) {
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(stripeConnectId);
  const transfersActive = account.capabilities?.transfers === "active";
  await ctx.runMutation(internal.financials.savePayoutAccount, {
    clerkId,
    stripeConnectId,
    transfersActive,
  });
  return transfersActive;
}

export const triggerStripePayout = internalAction({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.financials.createPendingLedgerEntry, { gameId: args.gameId });

    const context = await ctx.runQuery(internal.financials.getPayoutContext, { gameId: args.gameId });
    if (!context) return;

    const { ledgerEntry, stripeConnectId } = context;

    if (!stripeConnectId) {
      await ctx.runMutation(internal.financials.recordPayoutResult, {
        gameId: args.gameId,
        status: "FAILED",
        failureReason: "Referee has no linked Stripe Connect account",
      });
      return;
    }

    let stripe: Stripe;
    try {
      stripe = getStripeClient();
    } catch (err) {
      await ctx.runMutation(internal.financials.recordPayoutResult, {
        gameId: args.gameId,
        status: "FAILED",
        failureReason: err instanceof Error ? err.message : "STRIPE_SECRET_KEY is not configured",
      });
      return;
    }

    try {
      const transfer = await stripe.transfers.create(
        {
          amount: ledgerEntry.netAmountCents,
          currency: "usd",
          destination: stripeConnectId,
        },
        { idempotencyKey: `payout-${ledgerEntry._id}` }
      );

      await ctx.runMutation(internal.financials.recordPayoutResult, {
        gameId: args.gameId,
        status: "PAID",
        stripeTransferId: transfer.id,
      });
    } catch (err) {
      await ctx.runMutation(internal.financials.recordPayoutResult, {
        gameId: args.gameId,
        status: "FAILED",
        failureReason: err instanceof Error ? err.message : "Stripe transfer failed",
      });
    }
  },
});

export const startOnboarding = action({
  args: { returnUrl: v.string() },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const context = await ctx.runQuery(internal.financials.getMyRefereeContext, {});
    if (!context) throw new Error("Not authenticated");

    const stripe = getStripeClient();

    let stripeConnectId = context.stripeConnectId;
    if (!stripeConnectId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: context.email,
        capabilities: { transfers: { requested: true } },
      });
      stripeConnectId = account.id;
      await ctx.runMutation(internal.financials.savePayoutAccount, {
        clerkId: context.clerkId,
        stripeConnectId,
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeConnectId,
      type: "account_onboarding",
      refresh_url: args.returnUrl,
      return_url: args.returnUrl,
    });

    return { url: accountLink.url };
  },
});

export const refreshMyPayoutStatus = action({
  args: {},
  handler: async (ctx): Promise<{ transfersActive: boolean } | null> => {
    const context = await ctx.runQuery(internal.financials.getMyRefereeContext, {});
    if (!context) throw new Error("Not authenticated");
    if (!context.stripeConnectId) return null;

    const transfersActive = await refreshAccountStatus(ctx, context.clerkId, context.stripeConnectId);
    return { transfersActive };
  },
});

export const refreshRefereePayoutStatus = action({
  args: { refereeClerkId: v.string() },
  handler: async (ctx, args): Promise<{ transfersActive: boolean } | null> => {
    const admin = await ctx.runQuery(internal.financials.assertLeagueAdmin, {});
    if (!admin) throw new Error("Forbidden");

    const { stripeConnectId } = await ctx.runQuery(internal.financials.getRefereeStripeAccount, {
      refereeClerkId: args.refereeClerkId,
    });
    if (!stripeConnectId) return null;

    const transfersActive = await refreshAccountStatus(ctx, args.refereeClerkId, stripeConnectId);
    return { transfersActive };
  },
});
