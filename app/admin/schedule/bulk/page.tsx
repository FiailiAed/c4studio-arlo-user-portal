"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { ArloLoader } from "@/components/ui/arlo-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useOrgId } from "@/lib/use-org-id";
import { useCurrentSeason } from "@/lib/use-current-season";
import { buildFlatOrgUnitOptions } from "@/lib/org-units";
import type { Id } from "../../../../convex/_generated/dataModel";

const SELECT_CLASSNAME =
  "rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface PreviewGame {
  round: number;
  startTime: number;
  homeTeamId: Id<"teams">;
  homeTeamName: string;
  awayTeamId: Id<"teams">;
  awayTeamName: string;
  fieldId: Id<"fields">;
  fieldName: string;
  hasConflict: boolean;
}

export default function AdminBulkSchedulePage() {
  const orgId = useOrgId();
  const currentSeason = useCurrentSeason(orgId);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const effectiveSeasonId = (selectedSeasonId || currentSeason?._id) as Id<"seasons"> | undefined;

  const seasons = useQuery(api.seasons.listSeasons, orgId ? { orgId } : "skip");
  const orgUnits = useQuery(api.orgUnits.listOrgUnits, orgId ? { orgId } : "skip");
  const teams = useQuery(api.teams.listTeams, orgId ? { orgId } : "skip");
  const fields = useQuery(api.fields.listFields, orgId ? { orgId } : "skip");
  const placements = useQuery(
    api.teamSeasonPlacements.listPlacementsForSeason,
    orgId && effectiveSeasonId ? { orgId, seasonId: effectiveSeasonId } : "skip"
  );

  const convex = useConvex();
  const setTeamPlacement = useMutation(api.teamSeasonPlacements.setTeamPlacement);
  const removeTeamPlacement = useMutation(api.teamSeasonPlacements.removeTeamPlacement);
  const copyPlacements = useMutation(api.teamSeasonPlacements.copyPlacementsFromPreviousSeason);
  const commitRoundRobin = useMutation(api.bulkScheduling.commitRoundRobin);

  const orgUnitOptions = buildFlatOrgUnitOptions(orgUnits ?? []);
  const [selectedOrgUnitId, setSelectedOrgUnitId] = useState<string>("");

  const [addTeamId, setAddTeamId] = useState<string>("");
  const [copyFromSeasonId, setCopyFromSeasonId] = useState<string>("");
  const [copySubmitting, setCopySubmitting] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("6"); // Saturday default
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [previewGames, setPreviewGames] = useState<PreviewGame[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitSubmitting, setCommitSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  if (!orgId || seasons === undefined || seasons === null || orgUnits === undefined || teams === undefined || fields === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ArloLoader />
      </div>
    );
  }

  const placementsInUnit = (placements ?? []).filter((p) => p.orgUnitId === selectedOrgUnitId);
  const placedTeamIds = new Set((placements ?? []).map((p) => p.teamId));
  const availableTeamsToAdd = (teams ?? []).filter((t) => !placedTeamIds.has(t._id));
  const otherSeasons = seasons.filter((s) => s._id !== effectiveSeasonId);

  function toggleField(fieldId: string, checked: boolean) {
    setSelectedFieldIds((prev) => (checked ? [...prev, fieldId] : prev.filter((id) => id !== fieldId)));
  }

  async function handleAddTeam() {
    if (!orgId || !effectiveSeasonId || !selectedOrgUnitId || !addTeamId) return;
    await setTeamPlacement({
      orgId,
      seasonId: effectiveSeasonId,
      teamId: addTeamId as Id<"teams">,
      orgUnitId: selectedOrgUnitId as Id<"orgUnits">,
    });
    setAddTeamId("");
  }

  async function handleCopyFromSeason() {
    if (!orgId || !effectiveSeasonId || !copyFromSeasonId) return;
    setCopySubmitting(true);
    try {
      await copyPlacements({ orgId, seasonId: effectiveSeasonId, fromSeasonId: copyFromSeasonId as Id<"seasons"> });
    } finally {
      setCopySubmitting(false);
    }
  }

  async function handleGeneratePreview() {
    if (!orgId || !effectiveSeasonId || !selectedOrgUnitId || !startDate || selectedFieldIds.length === 0) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setCommitError(null);
    try {
      const result = await convex.query(api.bulkScheduling.previewRoundRobin, {
        orgId,
        seasonId: effectiveSeasonId,
        orgUnitId: selectedOrgUnitId as Id<"orgUnits">,
        startDate: new Date(startDate).getTime(),
        dayOfWeek: Number(dayOfWeek),
        timeOfDay,
        fieldIds: selectedFieldIds as Id<"fields">[],
      });
      setPreviewGames(result as PreviewGame[]);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Failed to generate preview");
      setPreviewGames(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleCommit() {
    if (!orgId || !effectiveSeasonId || !previewGames) return;
    setCommitSubmitting(true);
    setCommitError(null);
    try {
      await commitRoundRobin({
        orgId,
        seasonId: effectiveSeasonId,
        games: previewGames.map((g) => ({
          homeTeamId: g.homeTeamId,
          awayTeamId: g.awayTeamId,
          fieldId: g.fieldId,
          startTime: g.startTime,
        })),
      });
      setPreviewGames(null);
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : "Failed to create games");
    } finally {
      setCommitSubmitting(false);
    }
  }

  const hasAnyConflict = (previewGames ?? []).some((g) => g.hasConflict);

  const previewColumns: DataTableColumn<PreviewGame>[] = [
    { key: "round", header: "Round", render: (g) => g.round },
    { key: "date", header: "Date/Time", render: (g) => new Date(g.startTime).toLocaleString() },
    { key: "matchup", header: "Matchup", render: (g) => `${g.homeTeamName} vs ${g.awayTeamName}` },
    { key: "field", header: "Field", render: (g) => g.fieldName },
    {
      key: "status",
      header: "Status",
      render: (g) => (g.hasConflict ? <Badge variant="destructive">Conflict</Badge> : <Badge variant="secondary">OK</Badge>),
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center py-12 px-4">
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Bulk Schedule Generator</h1>
          <p className="text-sm text-muted-foreground">
            Generate a full round-robin schedule for every team placed in a division for a season.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Season &amp; Org Unit</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <select
              value={effectiveSeasonId ?? ""}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
              className={cn(SELECT_CLASSNAME)}
            >
              {seasons.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
            <select
              value={selectedOrgUnitId}
              onChange={(e) => { setSelectedOrgUnitId(e.target.value); setPreviewGames(null); }}
              className={cn(SELECT_CLASSNAME)}
            >
              <option value="" disabled>Select an org unit…</option>
              {orgUnitOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </CardContent>
        </Card>

        {effectiveSeasonId && selectedOrgUnitId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Teams in this Division for this Season</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {placementsInUnit.length === 0 ? (
                <p className="text-sm text-muted-foreground">No teams placed here yet.</p>
              ) : (
                <div className="space-y-1">
                  {placementsInUnit.map((p) => (
                    <div key={p._id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span>{p.teamName}</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeTeamPlacement({ orgId, seasonId: effectiveSeasonId, teamId: p.teamId })}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 border-t pt-3">
                <select value={addTeamId} onChange={(e) => setAddTeamId(e.target.value)} className={cn(SELECT_CLASSNAME, "flex-1")}>
                  <option value="" disabled>Add a team…</option>
                  {availableTeamsToAdd.map((t) => (
                    <option key={t._id} value={t._id}>{t.name}</option>
                  ))}
                </select>
                <Button size="sm" onClick={handleAddTeam} disabled={!addTeamId}>Add</Button>
              </div>

              {placementsInUnit.length === 0 && otherSeasons.length > 0 && (
                <div className="flex items-center gap-2 border-t pt-3">
                  <select value={copyFromSeasonId} onChange={(e) => setCopyFromSeasonId(e.target.value)} className={cn(SELECT_CLASSNAME, "flex-1")}>
                    <option value="" disabled>Copy placements from…</option>
                    {otherSeasons.map((s) => (
                      <option key={s._id} value={s._id}>{s.name}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" onClick={handleCopyFromSeason} disabled={!copyFromSeasonId || copySubmitting}>
                    {copySubmitting ? "Copying…" : "Copy from Previous Season"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {effectiveSeasonId && selectedOrgUnitId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generate Round-Robin</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Start date</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Day of week</label>
                  <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className={cn(SELECT_CLASSNAME, "w-full")}>
                    {DAYS_OF_WEEK.map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Time</label>
                  <Input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Fields</label>
                <div className="flex flex-wrap gap-3">
                  {(fields ?? []).map((f) => (
                    <label key={f._id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedFieldIds.includes(f._id)}
                        onChange={(e) => toggleField(f._id, e.target.checked)}
                      />
                      {f.name}
                    </label>
                  ))}
                </div>
              </div>
              {previewError && <p className="text-sm text-destructive">{previewError}</p>}
              <Button
                onClick={handleGeneratePreview}
                disabled={previewLoading || !startDate || selectedFieldIds.length === 0}
              >
                {previewLoading ? "Generating…" : "Generate Preview"}
              </Button>
            </CardContent>
          </Card>
        )}

        {previewGames && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Preview ({previewGames.length} games)</CardTitle>
              <Button onClick={handleCommit} disabled={hasAnyConflict || commitSubmitting}>
                {commitSubmitting ? "Creating…" : "Confirm & Create Games"}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {commitError && <p className="p-4 text-sm text-destructive">{commitError}</p>}
              <DataTable columns={previewColumns} rows={previewGames} getRowKey={(g) => `${g.round}-${g.homeTeamId}-${g.awayTeamId}`} emptyMessage="No games generated." />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
