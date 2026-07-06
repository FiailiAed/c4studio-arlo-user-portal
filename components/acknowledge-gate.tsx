"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../convex/_generated/api";
import { useActiveOrg } from "./active-org-provider";

const EXEMPT_PATHS = ["/acknowledge", "/sign-in", "/sign-up"];

export function AcknowledgeGate() {
  const { activeOrgId } = useActiveOrg();
  const required = useQuery(
    api.documents.getMyRequiredDocuments,
    activeOrgId ? { orgId: activeOrgId } : "skip"
  );
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
