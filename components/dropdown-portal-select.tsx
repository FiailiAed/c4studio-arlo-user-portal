"use client";

import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { hasAnyRole } from "@/lib/roles";
import { useOrgId } from "@/lib/use-org-id";

interface Portal {
  label: string;
  href: string;
  allowed: string[];
}

// Kept in the same order/shape as HotkeyNav's DESTINATIONS — both are role-filtered
// navigation lists sourced from the same org-scoped roles query.
const PORTALS: Portal[] = [
  { label: "Admin", href: "/admin", allowed: ["league_admin", "super_admin"] },
  { label: "Players", href: "/players", allowed: ["family", "league_admin", "super_admin"] },
  { label: "Referee", href: "/referee", allowed: ["referee", "league_admin", "super_admin"] },
  { label: "Coach", href: "/coach", allowed: ["coach", "league_admin", "super_admin"] },
  // /program has no real page yet (program_admin is speculative scaffolding) —
  // kept visible to that role as a placeholder reminder rather than removed.
  { label: "Program", href: "/program", allowed: ["program_admin", "league_admin", "super_admin"] },
];

export function DropdownPortalSelect() {
  const orgId = useOrgId();
  const myRoles = useQuery(api.orgMemberships.getMyRoles, orgId ? { orgId } : "skip");
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const availablePortals = PORTALS.filter((p) => hasAnyRole(myRoles ?? [], p.allowed));
  const currentPortal = availablePortals.find((p) => pathname.startsWith(p.href));
  const selected = currentPortal?.label ?? "Select Portal";

  const handleSelect = (portal: Portal) => {
    setIsOpen(false);
    window.open(portal.href, "_parent");
  };

  if (availablePortals.length === 0) return null;

  return (
    <div className="flex flex-col w-44 text-sm relative">
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full text-left px-4 pr-2 py-2 border rounded bg-white text-gray-800 border-gray-300 shadow-sm hover:bg-gray-50 focus:outline-none" >
            <span>{selected}</span>
            <svg className={`w-5 h-5 inline float-right transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#6B7280" >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        </button>

        {isOpen && (
            <ul className="absolute left-0 top-full z-50 w-full bg-white border border-gray-300 rounded shadow-md mt-1 py-2">
                {availablePortals.map((portal) => (
                    <li key={portal.label} className="px-4 py-2 hover:bg-linear-22 from-slate-700 to-slate-900 hover:text-white cursor-pointer" onClick={() => handleSelect(portal)} >
                        <a href={portal.href}>{portal.label}</a>
                    </li>
                ))}
            </ul>
        )}
    </div>
  );
}
