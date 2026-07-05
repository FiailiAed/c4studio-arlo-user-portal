"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import { hasAnyRole } from "@/lib/roles";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CHORD_TIMEOUT_MS = 1000;

// Gmail-style "g" then a letter, e.g. g -> a navigates to /admin.
// Each entry's `allowed` role list controls whether the shortcut is bound at all.
const DESTINATIONS: { key: string; href: string; label: string; allowed?: string[] }[] = [
  { key: "d", href: "/dashboard", label: "Dashboard" },
  { key: "a", href: "/admin", label: "Admin", allowed: ["league_admin", "super_admin"] },
  { key: "r", href: "/referee", label: "Referee", allowed: ["referee", "league_admin", "super_admin"] },
  { key: "c", href: "/coach", label: "Coach", allowed: ["coach", "league_admin", "super_admin"] },
  { key: "p", href: "/players", label: "Players", allowed: ["family", "league_admin", "super_admin"] },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function HotkeyNav() {
  const profile = useQuery(api.users.getCurrentUser);
  const router = useRouter();
  const awaitingSecondKey = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const roles = profile?.roles ?? [];
  const availableDestinations = DESTINATIONS.filter((d) => !d.allowed || hasAnyRole(roles, d.allowed));

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (!awaitingSecondKey.current) {
        if (e.key === "g") {
          awaitingSecondKey.current = true;
          timeoutRef.current = setTimeout(() => {
            awaitingSecondKey.current = false;
          }, CHORD_TIMEOUT_MS);
          return;
        }
        if (e.key === "?") {
          e.preventDefault();
          setHelpOpen((prev) => !prev);
        }
        return;
      }

      awaitingSecondKey.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      const destination = availableDestinations.find((d) => d.key === e.key);
      if (!destination) return;

      e.preventDefault();
      router.push(destination.href);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [availableDestinations, router]);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {availableDestinations.map((d) => (
            <div key={d.key} className="flex items-center justify-between">
              <span className="text-muted-foreground">{d.label}</span>
              <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">g {d.key}</kbd>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-muted-foreground">Show this help</span>
            <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">?</kbd>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
