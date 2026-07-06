import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

/**
 * Authentication-only gating, deliberately.
 *
 * In the Clerk-organizations design this app used to have, a JWT session
 * claim (`sessionClaims.metadata.roles`) carried the caller's role and this
 * middleware could redirect `/admin`, `/referee`, `/coach` before a single
 * Convex round-trip happened. That claim no longer exists: this branch moved
 * all tenancy and roles into Convex (`orgMemberships`), and Clerk is used
 * purely for authentication now. Middleware has no JWT claim left to read,
 * so it can only assert "is this user signed in," never "is this user
 * authorized for this org/role" — that check now happens exclusively at the
 * Convex query/mutation layer (see convex/lib/auth.ts's requireLeagueAdmin
 * / requireRefereeQuery / requireCoachQuery helpers), the same pattern this
 * app already used for `/players`, which never had middleware role gating.
 * Route-level UI still redirects unauthorized users away from admin/referee/
 * coach pages once the relevant Convex query resolves — enforcement just
 * lives one layer down from here.
 */
export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;
  await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
