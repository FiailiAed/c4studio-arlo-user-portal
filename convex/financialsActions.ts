"use node";

import { v } from "convex/values";
import Stripe from "stripe";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

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

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      await ctx.runMutation(internal.financials.recordPayoutResult, {
        gameId: args.gameId,
        status: "FAILED",
        failureReason: "STRIPE_SECRET_KEY is not configured",
      });
      return;
    }

    const stripe = new Stripe(secretKey);

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
