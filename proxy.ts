import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { hasAnyRole } from "@/lib/roles";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isRefereeRoute = createRouteMatcher(["/referee(.*)"]);
const isCoachRoute = createRouteMatcher(["/coach(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;
  await auth.protect();
  if (isAdminRoute(request)) {
    const { sessionClaims } = await auth();
    const roles = (sessionClaims?.metadata as { roles?: string[] } | undefined)?.roles;
    if (!hasAnyRole(roles, ["league_admin", "super_admin"])) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }
  if (isRefereeRoute(request)) {
    const { sessionClaims } = await auth();
    const roles = (sessionClaims?.metadata as { roles?: string[] } | undefined)?.roles;
    if (!hasAnyRole(roles, ["referee", "league_admin", "super_admin"])) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }
  if (isCoachRoute(request)) {
    const { sessionClaims } = await auth();
    const roles = (sessionClaims?.metadata as { roles?: string[] } | undefined)?.roles;
    if (!hasAnyRole(roles, ["coach", "league_admin", "super_admin"])) {
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
