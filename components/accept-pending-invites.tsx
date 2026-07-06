"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";

/**
 * Fires once per app load for a signed-in user: matches their verified email
 * against any pending `orgInvitations` and materializes the corresponding
 * orgMemberships. Renders nothing — this is a side-effect-only component,
 * mounted globally in the signed-in header so it runs right after sign-in
 * or sign-up regardless of which page the user lands on.
 */
export function AcceptPendingInvites() {
  const acceptMyPendingInvites = useMutation(api.orgInvitations.acceptMyPendingInvites);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void acceptMyPendingInvites({});
  }, [acceptMyPendingInvites]);

  return null;
}
