"use client";

import { useActiveOrg } from "@/components/active-org-provider";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Replaces Clerk's <OrganizationSwitcher/>. Deliberately renders nothing when
 * the user has 0 or 1 org memberships — a dropdown with a single, forced
 * option is just noise, and most users at launch (SJYLAX) only ever belong
 * to one org.
 */
export function OrgSwitcher() {
  const { memberships, activeOrgId, setActiveOrgId } = useActiveOrg();

  if (!memberships || memberships.length < 2) return null;

  return (
    <select
      aria-label="Switch organization"
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 shadow-sm focus:outline-none"
      value={activeOrgId ?? ""}
      onChange={(e) => setActiveOrgId(e.target.value as Id<"organizations">)}
    >
      {!activeOrgId && (
        <option value="" disabled>
          Select organization…
        </option>
      )}
      {memberships.map(({ org }) => (
        <option key={org._id} value={org._id}>
          {org.name}
        </option>
      ))}
    </select>
  );
}
