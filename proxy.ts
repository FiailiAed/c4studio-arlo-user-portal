import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isRefereeRoute = createRouteMatcher(["/referee(.*)"]);
const isCoachRoute = createRouteMatcher(["/coach(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;
  await auth.protect();
  if (isAdminRoute(request)) {
    // Org-scoped check: league_admin/super_admin were mapped to Clerk's native
    // "org:admin" role for exactly this reason — proxy.ts (Edge middleware)
    // can't cheaply query Convex's per-org orgMemberships per request, but
    // Clerk's own session token already carries the active org's role for
    // free. Checking the old global user-level publicMetadata.roles here
    // would pass/fail based on the user's role in some ARBITRARY org, not
    // the one they're currently switched into.
    const { orgRole } = await auth();
    if (orgRole !== "org:admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }
  if (isRefereeRoute(request)) {
    // Clerk's native org role (org:admin/org:member) can't express "referee" —
    // only the org-scoped orgMemberships in Convex knows that, and this Edge
    // middleware can't cheaply query it per request. So the cheapest correct
    // check here is "does this user have an active org at all"; the actual
    // referee-only gate happens in the Convex query (requireRefereeQuery,
    // which returns null — not throws — for the wrong role) and the page
    // renders its own empty/no-access state for that null, same as it always
    // has for a genuinely-empty result.
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }
  if (isCoachRoute(request)) {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
