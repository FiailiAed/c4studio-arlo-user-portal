"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

function pickCurrentSeason(seasons: Doc<"seasons">[]): Doc<"seasons"> | undefined {
  if (seasons.length === 0) return undefined;
  const now = Date.now();
  const active = seasons.find((s) => s.startDate <= now && now <= s.endDate);
  if (active) return active;
  return seasons.slice().sort((a, b) => b._creationTime - a._creationTime)[0];
}

/**
 * The org's "current" season for defaulting a season picker — whichever
 * season's date range contains today, falling back to the most recently
 * created season if none matches "now". Returns undefined while loading or
 * if the org has no seasons yet.
 */
export function useCurrentSeason(orgId: string | undefined): Doc<"seasons"> | undefined {
  const seasons = useQuery(api.seasons.listSeasons, orgId ? { orgId } : "skip");
  return seasons ? pickCurrentSeason(seasons) : undefined;
}
