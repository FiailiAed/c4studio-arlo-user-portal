"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { useOrgId } from "@/lib/use-org-id";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type LedgerRow = Doc<"payoutLedger"> & {
  gameMatchup: string;
  gameStartTime?: number;
  refereeName: string;
};

type PayoutStatus = Doc<"payoutLedger">["status"];

const STATUS_VARIANT: Record<PayoutStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  PAID: "default",
  FAILED: "destructive",
};

function centsToDollarsInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function AdminFinancialsPage() {
  const orgId = useOrgId();
  const settings = useQuery(api.financials.getLeagueSettings, orgId ? { orgId } : "skip");
  const referees = useQuery(api.financials.listReferees, orgId ? { orgId } : "skip");
  const ledger = useQuery(api.financials.listPayoutLedger, orgId ? { orgId } : "skip");

  const updateLeagueSettings = useMutation(api.financials.updateLeagueSettings);
  const setRefereeStripeAccount = useMutation(api.financials.setRefereeStripeAccount);
  const retryPayout = useMutation(api.financials.retryPayout);
  const refreshRefereePayoutStatus = useAction(api.financialsActions.refreshRefereePayoutStatus);

  const [rateDraft, setRateDraft] = useState<string | null>(null);
  const [rateSubmitting, setRateSubmitting] = useState(false);

  const [stripeIdDrafts, setStripeIdDrafts] = useState<Record<string, string>>({});
  const [retryingId, setRetryingId] = useState<Id<"payoutLedger"> | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  if (!orgId || settings === undefined || referees === undefined || ledger === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  const rateValue = rateDraft ?? (settings ? centsToDollarsInput(settings.refereePayRateCents) : "0.00");

  async function commitRate() {
    if (!orgId || rateDraft === null) return;
    const dollars = Number(rateDraft);
    if (Number.isNaN(dollars) || dollars < 0) return;
    setRateSubmitting(true);
    try {
      await updateLeagueSettings({ orgId, refereePayRateCents: Math.round(dollars * 100) });
      setRateDraft(null);
    } finally {
      setRateSubmitting(false);
    }
  }

  async function commitStripeId(clerkId: string) {
    const draft = stripeIdDrafts[clerkId];
    if (!orgId || draft === undefined) return;
    await setRefereeStripeAccount({ orgId, refereeClerkId: clerkId, stripeConnectId: draft.trim() || undefined });
  }

  async function handleRetry(payoutLedgerId: Id<"payoutLedger">) {
    if (!orgId) return;
    setRetryingId(payoutLedgerId);
    try {
      await retryPayout({ orgId, payoutLedgerId });
    } finally {
      setRetryingId(null);
    }
  }

  async function handleRefreshStatus(refereeClerkId: string) {
    if (!orgId) return;
    setRefreshingId(refereeClerkId);
    try {
      await refreshRefereePayoutStatus({ orgId, refereeClerkId });
    } finally {
      setRefreshingId(null);
    }
  }

  const ledgerColumns: DataTableColumn<LedgerRow>[] = [
    {
      key: "date",
      header: "Game",
      render: (r) => (
        <div>
          <div>{r.gameMatchup}</div>
          {r.gameStartTime && (
            <div className="text-xs text-muted-foreground">{new Date(r.gameStartTime).toLocaleString()}</div>
          )}
        </div>
      ),
    },
    { key: "referee", header: "Referee", render: (r) => r.refereeName },
    { key: "gross", header: "Gross", render: (r) => `$${(r.grossAmountCents / 100).toFixed(2)}` },
    { key: "fee", header: "Platform Fee", render: (r) => `$${(r.platformFeeCents / 100).toFixed(2)}` },
    { key: "net", header: "Net Payout", render: (r) => `$${(r.netAmountCents / 100).toFixed(2)}` },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div className="space-y-1">
          <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
          {r.failureReason && <p className="text-xs text-destructive">{r.failureReason}</p>}
        </div>
      ),
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-5xl space-y-6">
        <h1 className="text-2xl font-semibold">Financials</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">League Settings</CardTitle>
            <CardDescription>Flat rate paid to a referee for every completed game.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={rateValue}
              onChange={(e) => setRateDraft(e.target.value)}
              className="max-w-[120px]"
            />
            <Button size="sm" onClick={commitRate} disabled={rateSubmitting || rateDraft === null}>
              {rateSubmitting ? "Saving…" : "Save"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Referee Stripe Accounts</CardTitle>
            <CardDescription>Paste a referee&apos;s Stripe Connect account ID to enable payouts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(referees ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No users with the referee role yet.</p>
            ) : (
              (referees ?? []).map((referee) => {
                const status = !referee.stripeConnectId
                  ? "not_connected"
                  : referee.transfersActive
                    ? "active"
                    : "incomplete";
                return (
                  <div key={referee._id} className="flex items-center gap-2">
                    <span className="w-48 truncate text-sm">
                      {`${referee.firstName ?? ""} ${referee.lastName ?? ""}`.trim() || referee.email || referee.clerkId}
                    </span>
                    <Input
                      value={stripeIdDrafts[referee.clerkId] ?? referee.stripeConnectId ?? ""}
                      onChange={(e) => setStripeIdDrafts((prev) => ({ ...prev, [referee.clerkId]: e.target.value }))}
                      onBlur={() => commitStripeId(referee.clerkId)}
                      placeholder="acct_..."
                      className="max-w-xs"
                    />
                    {status === "active" && <Badge variant="default">Active</Badge>}
                    {status === "incomplete" && <Badge variant="outline">Onboarding incomplete</Badge>}
                    {status === "not_connected" && (
                      <Badge variant="destructive" className="text-muted-foreground">Not connected</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRefreshStatus(referee.clerkId)}
                      disabled={!referee.stripeConnectId || refreshingId === referee.clerkId}
                    >
                      {refreshingId === referee.clerkId ? "Refreshing…" : "Refresh Status"}
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payout Ledger</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={ledgerColumns}
              rows={ledger ?? []}
              getRowKey={(r) => r._id}
              emptyMessage="No payouts yet."
              renderActions={(r) =>
                r.status === "FAILED" ? (
                  <Button size="sm" variant="outline" onClick={() => handleRetry(r._id)} disabled={retryingId === r._id}>
                    {retryingId === r._id ? "Retrying…" : "Retry"}
                  </Button>
                ) : null
              }
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
