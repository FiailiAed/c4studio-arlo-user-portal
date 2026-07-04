"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/invite", label: "Invite" },
  { href: "/admin/data", label: "Data" },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col">
      <nav className="flex items-center gap-2 border-b px-4 py-2">
        {ADMIN_NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(buttonVariants({ variant: pathname === href ? "default" : "ghost", size: "sm" }))}
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
