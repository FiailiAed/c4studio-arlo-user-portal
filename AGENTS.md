<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:Technology Stack and Developer Preferences -->
## Tech Stack
- **Runtime**: Bun
- **Frontend**: Next.js (App Router), TypeScript (NEVER JAVASCRIPT), Tailwind CSS
- **Database/Backend**: Convex (real-time, serverless)
- **Authentication**: Clerk (role-based access)
- **Payments**: Stripe
- **UI Components**: shadcn/ui
- **Hosting**: Vercel

## Developer Preferences
- **Typescript**: Never, never, never, never, never, never, never use JAVASCRIPT, WE ONLY USE TYPSCRIPT AND WE ARE STRICT! NO ANYs, EVERYTHING DEFINED AND TYPED PROPERLY!!!
- **Why**: Typescript is a huge advantage when using agents and we want to utilize this advantage. If you see Javascript files or not strict Typescript files, you immediately must raise this to the developer and seek to fix the issue you have found.

- **Delete Code**: I love to delete unused code, packages, and dependencies. If we don't need it and it won't break the app to remove it, DELETE IT WITH NO QUESTIONS ASKED.
- **Why**: Much of my coding is now done with LLMs and LLM agents, because of this we must assume that 90 percent of the code is garbage, slop, useless code. WE NEED TO TRIM THE FAT AT ALL TIMES AND FIGHT DAILY AGAINST PROJECT BLOAT AND EXCESIVE LLM CODE.
<!-- END:Technology Stack and Developer Preferences -->

<!-- BEGIN:Agent Specification -->
# ARLO (Automated Referee & League Operations) - Agent Specification

## Core Philosophy & Architecture
Agent, you are building ARLO using the strict T3/Convex Stack. Do not hallucinate Redux, custom Express servers, or custom JWT auth. 

**The Tech Stack (Non-Negotiable):**
- **Runtime:** Bun
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Database/Backend:** Convex (Real-time, serverless WebSockets)
- **Authentication:** Clerk (B2B Organizations & Role-Based Access)
- **Payments:** Stripe Connect
- **UI Components:** shadcn/ui (Slate theme, minimal utilitarian design)

**The Paradigm (Modern "MVC"):**
1. **Model (Schema):** `convex/schema.ts` (Strict Zod-style validation using Convex `v`).
2. **Controller (API):** `convex/queries.ts` and `convex/mutations.ts` (All business logic and auth checks happen here).
3. **View (UI):** Next.js Server Components for layout/auth, Client Components for real-time Convex `useQuery` hooks.
4. **Interaction:** Optimistic UI updates where possible; let Convex WebSockets handle the rest.

---

## Project 1: Identity & User Registration
**Intent:** Establish multi-tenant league boundaries and user roles via Clerk.

1. **Schema:** Clerk handles core user data. Convex `users` table syncs via Clerk Webhooks.
2. **API:** `syncUser` (mutation triggered by webhook), `getCurrentUser` (query).
3. **View:** `<ClerkProvider>`, `(public)/sign-in`, `<OrganizationSwitcher />` in the navbar.
4. **Interactions:** User signs in, selects their League (Organization), and is routed based on their Clerk Role (`admin`, `referee`, `coach`).
5. **Success:** A user can log in, and their `org_id` is automatically securely passed to all subsequent Convex queries.

## Project 2: The Core Engine - Game Scheduling
**Intent:** The core value prop. A fast, optimistic scheduling board that prevents double-booking.

1. **Schema:** `games`, `fields`, `teams` (All stamped with `orgId`).
2. **API:** `getGamesBySeason` (query), `createGame`, `updateGameSlot` (mutations). 
3. **View:** `(admin)/schedule`. A dense, calendar/list view built with shadcn tables.
4. **Interactions:** Admin creates a game. If they assign a field that is already booked, Convex throws an error.
5. **Success:** The state machine (`PENDING_ASSIGNMENT`, `REF_ASSIGNED`, etc.) is fully typed. Real-time updates occur across all open browser windows when a game time shifts.

## Project 3: The Money Maker - Referee Management
**Intent:** The exception-based workflow to ensure games get officiated and refs get paid.

1. **Schema:** `refereeProfiles` (links Clerk ID to Stripe Connect ID). `games` updated with `refereeId`.
2. **API:** `getAvailableRefs` (query), `assignReferee` (mutation), `acceptGame` (mutation for ref).
3. **View:** - `(admin)/dashboard`: The "ARLO Alert" interface showing games bleeding Crimson Red if `status === "PENDING_ASSIGNMENT"` within 48 hours of kickoff.
   - `(referee)/dashboard`: Mobile-first view for refs to see upcoming games.
4. **Interactions:** Admin clicks "Auto-Assign" -> ARLO suggests a ref -> Admin approves -> Ref clicks "Accept" on their phone -> Game state instantly turns Turf Green on Admin dashboard.
5. **Success:** Seamless state transitions from unassigned to assigned, with mobile frictionless UX for the ref.

## Project 4: Program & Team Administration
**Intent:** Allowing coaches to manage their specific subset of data without seeing the entire league.

1. **Schema:** `clubs`, `rosters`, `players`.
2. **API:** `getTeamRoster` (query filtered by `coachId`), `submitScore` (mutation).
3. **View:** `(coach)/dashboard`. Read-only schedule view, active roster view.
4. **Interactions:** Coach views their upcoming weekend. Post-game, coach can verify the score submitted by the referee.
5. **Success:** Strict RBAC. A coach trying to query the `leagues` settings or another team's private data is blocked by Convex backend rules.

## Project 5: Automated Economics - Financials & Reports
**Intent:** Integrating Stripe Connect to capture the 1.5% transaction fee on ref payouts.

1. **Schema:** `payoutLedger`.
2. **API:** `triggerStripePayout` (Convex Action - allows calling third-party Node APIs like Stripe).
3. **View:** `(admin)/financials`.
4. **Interactions:** When game status reaches `COMPLETED_WITH_SCORE`, a Convex Action automatically fires a Stripe Connect transfer to the assigned `refereeId`.
5. **Success:** Zero manual data entry for referee payroll. Admins save hours, and the platform generates revenue automatically.

## Project 6: Dispute Resolution Protocol
**Intent:** Handling the human exceptions smoothly.

1. **Schema:** `games` status union adds `"DISPUTED"`. `disputes` table for message logs.
2. **API:** `flagDispute` (mutation), `resolveDispute` (mutation).
3. **View:** `(admin)/exceptions`.
4. **Interactions:** Coach disagrees with Ref score -> Clicks "Dispute" -> Admin gets an ARLO Alert -> Admin overrides score -> Status moves back to `COMPLETED_WITH_SCORE` -> Pay is released.
5. **Success:** No angry text messages. All conflict is logged and resolved asynchronously within the ARLO UI.

## Project 7: Document Storage & Compliance
**Intent:** Handling waivers and league rules.

1. **Schema:** `documents` using Convex File Storage.
2. **API:** `generateUploadUrl` (mutation), `saveDocumentMetadata` (mutation).
3. **View:** `(admin)/settings/documents`.
4. **Interactions:** Admin uploads PDF of league rules. Coaches must click "Acknowledge" before their dashboard unlocks.
5. **Success:** 100% compliance tracking handled natively inside Convex without needing a third-party AWS S3 bucket setup.

## Project Structure
/arlo-web
├── convex/             (Your single source of truth for the DB)
│   ├── schema.ts
│   ├── games.ts
│   └── users.ts
├── src/
│   ├── app/
│   │   ├── (public)/   (The marketing brochure page we just built)
│   │   ├── (admin)/    (Project 2, 5, 7 - The League Admin Dashboard)
│   │   ├── (coach)/    (Project 4 - The Team Roster view)
│   │   └── (referee)/  (Project 3 - Mobile-friendly ref acceptance)
│   └── components/     (Your single shadcn/ui folder used by everyone)
<!-- END:Agent Specification -->
