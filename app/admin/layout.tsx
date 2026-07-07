"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/org-units", label: "Org Hierarchy" },
  { href: "/admin/residency", label: "Residency" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/invite", label: "Invite" },
  { href: "/admin/data", label: "Data" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/clubs", label: "Clubs" },
  { href: "/admin/financials", label: "Financials" },
  { href: "/admin/exceptions", label: "Exceptions" },
  { href: "/admin/settings/documents", label: "Documents" },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r">
        <nav className="flex flex-col gap-1 p-4">
          {ADMIN_NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                buttonVariants({ variant: pathname === href ? "default" : "ghost", size: "sm" }),
                "justify-start w-full"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex md:hidden items-center border-b px-4 py-2">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open admin navigation"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <Menu className="size-5" />
        </button>
      </div>

      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => setMobileNavOpen(false)}
        >
          <nav
            className="absolute left-0 top-0 h-full w-64 bg-background border-r p-4 flex flex-col gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close admin navigation"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-end mb-2")}
            >
              <X className="size-5" />
            </button>
            {ADMIN_NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  buttonVariants({ variant: pathname === href ? "default" : "ghost", size: "sm" }),
                  "justify-start w-full"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <main className="flex-1">{children}</main>
    </div>
  );
}
