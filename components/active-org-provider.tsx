"use client";

import { useQuery } from "convex/react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

const STORAGE_KEY = "arlo:activeOrgId";

export type OrgMembership = {
  org: Doc<"organizations">;
  roles: string[];
};

type ActiveOrgContextValue = {
  /** undefined while loading, null if the user has no memberships. */
  memberships: OrgMembership[] | undefined;
  activeOrgId: Id<"organizations"> | null;
  activeOrg: Doc<"organizations"> | null;
  /** The caller's roles within activeOrg (empty until an org is selected). */
  activeOrgRoles: string[];
  setActiveOrgId: (orgId: Id<"organizations">) => void;
};

const ActiveOrgContext = createContext<ActiveOrgContextValue | null>(null);

/**
 * There is no Clerk org claim in this design (see AGENTS.md task brief), so
 * "which org am I currently viewing" is purely a client-side concept, seeded
 * from `organizations.listMine()` and persisted to localStorage. When a user
 * belongs to exactly one org (the common case at launch — SJYLAX is tenant
 * #1) it's auto-selected and no switcher UI is ever shown.
 */
export function ActiveOrgProvider({ children }: { children: React.ReactNode }) {
  const rawMemberships = useQuery(api.organizations.listMine);
  const memberships = useMemo<OrgMembership[] | undefined>(() => {
    if (!rawMemberships) return rawMemberships;
    return rawMemberships.filter(
      (m): m is { org: Doc<"organizations">; roles: string[] } => m.org !== null
    );
  }, [rawMemberships]);

  const [activeOrgId, setActiveOrgIdState] = useState<Id<"organizations"> | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Reading localStorage is exactly the "synchronize with an external
    // system" case useEffect exists for (https://react.dev/learn/you-might-not-need-an-effect):
    // it can't happen during render because `window` isn't available in the
    // server render pass, so the value has to be pulled in after mount.
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveOrgIdState(stored as Id<"organizations">);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !memberships) return;
    const validIds = new Set(memberships.map((m) => m.org._id));

    if (activeOrgId && validIds.has(activeOrgId)) return;

    if (memberships.length === 1) {
      // Auto-selecting the caller's only org membership — this is the
      // common case at launch and intentionally requires no user action.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveOrgIdState(memberships[0].org._id);
    } else if (activeOrgId) {
      // Previously-stored org is no longer valid for this user.
      setActiveOrgIdState(null);
    }
  }, [hydrated, memberships, activeOrgId]);

  function setActiveOrgId(orgId: Id<"organizations">) {
    setActiveOrgIdState(orgId);
    window.localStorage.setItem(STORAGE_KEY, orgId);
  }

  const activeOrg = useMemo(
    () => memberships?.find((m) => m.org._id === activeOrgId)?.org ?? null,
    [memberships, activeOrgId]
  );
  const activeOrgRoles = useMemo(
    () => memberships?.find((m) => m.org._id === activeOrgId)?.roles ?? [],
    [memberships, activeOrgId]
  );

  const value: ActiveOrgContextValue = {
    memberships,
    activeOrgId,
    activeOrg,
    activeOrgRoles,
    setActiveOrgId,
  };

  return <ActiveOrgContext.Provider value={value}>{children}</ActiveOrgContext.Provider>;
}

export function useActiveOrg(): ActiveOrgContextValue {
  const ctx = useContext(ActiveOrgContext);
  if (!ctx) throw new Error("useActiveOrg must be used within an ActiveOrgProvider");
  return ctx;
}
