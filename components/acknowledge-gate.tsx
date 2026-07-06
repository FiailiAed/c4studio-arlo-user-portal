"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../convex/_generated/api";
import { useOrgId } from "@/lib/use-org-id";

const EXEMPT_PATHS = ["/acknowledge", "/sign-in", "/sign-up"];

export function AcknowledgeGate() {
  const orgId = useOrgId();
  const required = useQuery(api.documents.getMyRequiredDocuments, orgId ? { orgId } : "skip");
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!required) return;
    if (EXEMPT_PATHS.some((path) => pathname.startsWith(path))) return;

    const hasOutstanding = required.some((r) => !r.acknowledged);
    if (hasOutstanding) {
      router.replace("/acknowledge");
    }
  }, [required, pathname, router]);

  return null;
}
