"use client";

import { useOrganization } from "@clerk/nextjs";

/**
 * The active Clerk Organization id, or undefined while it's still loading /
 * before one is selected. Every org-scoped Convex query/mutation takes this
 * as an explicit `orgId` arg — Convex has no implicit "active org" server-side.
 */
export function useOrgId(): string | undefined {
  const { organization, isLoaded } = useOrganization();
  return isLoaded ? organization?.id : undefined;
}
