# Memory file for Current Agent working on this project

Every fact below was verified by reading the actual current files at the time this was written (branch `development`, after commit `1d76366`), not recalled from conversation summary. If something here conflicts with what you observe in the repo, trust the repo — this file can drift out of date, especially the schema/file listings.

---

## What This Project Is

**A.R.L.O.** (Automated Referee & League Operations) — a youth-sports league management platform. This repo is the **user portal**. All 7 projects defined in `AGENTS.md`'s spec have now been built (see "Project Status" below), plus several features not in the original spec (multi-role users, hotkey navigation).

**Important context on scope**: this codebase is being built for a real client, **SJYLAX (South Jersey Youth Lacrosse League)** — see the `SJYLAX Client Custom Build` section in `AGENTS.md` for their actual organizational structure (Organization → League → Townships → Programs → Divisions → Counties → Teams → Games) and real documents (Bylaws, Rules of Play, age-requirement spreadsheets). **The developer's explicit direction**: build this as generically reusable software (not hardcoded to SJYLAX's specific vocabulary like "Township"/"County"), so the same codebase can be deployed for SJYLAX now and other leagues later, while deferring true multi-tenant SaaS infrastructure until it's actually needed. Read the "Gap Inventory & Roadmap" section below before starting new feature work — there is a specific, developer-approved order for what comes next.

The developer codes primarily with LLM agents and explicitly wants aggressive deletion of unused code — see `AGENTS.md`'s "Developer Preferences" section (checked into the repo, always read it).

---

## How This Developer Works — Read Before Doing Anything

1. **This developer reviews plans carefully and enjoys the planning back-and-forth.** For any non-trivial feature, use plan mode: explore, then use `AskUserQuestion` with a clearly-labeled "(Recommended)" option plus real trade-offs for genuine architectural forks — don't just proceed on assumptions. This developer routinely picks the non-default option when they have specific product reasons (e.g. chose "add a new coach role" over reusing `program_admin`; chose "full club hierarchy" over the flatter option; chose to keep payout timing as-is over gating it on dispute resolution). Presenting real trade-offs matters more than presenting *the* right answer.
2. **This developer works on their own files concurrently, in parallel with agent sessions, and does not always mention it.** Multiple times in this project's history, `git status` showed unrelated modified/untracked files (a `DropdownPortalSelect` component, an `AGENTS.md` design-system addendum, a `family/edit` page WIP) that were the developer's own uncommitted work-in-progress, not agent output. **Always run `git status --short` before committing and stage only the files relevant to the current task** — do not sweep up unrelated changes into your commit, and do not "clean up" or rewrite the developer's own in-progress files without being asked. The one exception: if the developer's own file has a blocking error (e.g. a strict-mode TypeScript error failing `bun run build`) that prevents verifying *your* work, ask whether to apply a minimal, narrowly-scoped fix (e.g. add a type annotation) — don't restructure their file.
3. **Do not start a background `bun run dev` for smoke-testing.** This developer runs their own dev server locally while working alongside the agent. A background dev server (or repeatedly killing/restarting one via `pkill -f "next dev"`) can collide with their running instance and corrupt their live browser session (observed once: manifested as `Uncaught SyntaxError: Unexpected end of script` in the browser from a truncated JS chunk). Verify with `bunx tsc --noEmit`, `bun run build`, and `bun run lint` only; ask the developer to manually verify routes/flows in their own running server.
4. **Live-data mutations always need explicit confirmation at execution time**, separate from approving the overall plan — this came up twice: running a one-time Convex backfill mutation against real user data, and (initially proposed, later found unnecessary) a Clerk `publicMetadata` migration script. An auto-mode permission classifier will also block broad reads of user PII (e.g. an unscoped `users.listAll`-style dump) — expect this, and use narrower/scoped queries or ask first.
5. **The developer sometimes fixes things themselves mid-session** (e.g. manually edited Clerk `publicMetadata` for a stuck account directly in the Clerk dashboard rather than waiting for a script). Before assuming a migration/backfill is still needed, verify actual current state (e.g. via the `clerk-cli` skill / `clerk users list`) rather than trusting that code-driven paths were the only way data changed.
6. **Ask clarifying questions before big/ambiguous asks, but don't over-ask on bounded, well-specified follow-ups.** When the developer says "yes implement both" or gives a specific bug report, proceed directly — reserve `AskUserQuestion` for genuine forks (multiple valid designs, meaningfully different scope/cost, or anything touching real external services/money).

---

## Tech Stack (verified from `package.json`, current as of this writing)

| Layer | Package | Version |
|---|---|---|
| Framework | `next` | 16.2.9 (Turbopack; breaking changes from older Next — read `node_modules/next/dist/docs/` before assuming API shape) |
| Auth | `@clerk/nextjs` | ^7.5.11 |
| Backend/DB | `convex` | ^1.42.1 |
| Payments | `stripe` | ^22.3.0 (added for Project 5) |
| UI | `@base-ui/react` + `shadcn` | — (NOT Radix — component internals differ from shadcn's Radix-based docs/training data) |
| Styling | `tailwindcss` | ^4 |
| Icons | `lucide-react` | ^1.22.0 |
| Webhooks | `svix` | ^1.96.1 (Clerk webhook signature verification) |
| Runtime | Bun | always use `bun`/`bunx`, never `npm`/`npx` |

**Next.js 16 breaking changes that matter here** (already discovered, don't rediscover):
- `proxy.ts` at repo root, not `middleware.ts`.
- `params`/`searchParams` are Promises — `await` them (or `use()` them client-side, e.g. `app/admin/data/[tableId]/page.tsx`, `app/admin/clubs/[clubId]/roster/page.tsx`).
- `SignedIn`/`SignedOut` aren't exported from `@clerk/nextjs` — use `<Show when="signed-in">` / `<Show when="signed-out">`.
- shadcn `Button` has no `asChild` (uses `@base-ui/react`, not Radix) — use `buttonVariants({...})` + `<Link>` directly.

---

## Identity & Roles

**Multi-role**: users can hold multiple roles simultaneously. `AppRole` (`lib/roles.ts`) = `"family" | "referee" | "program_admin" | "coach" | "league_admin" | "super_admin"`. Stored as `users.roles: string[]` in Convex (there is **no** singular `role` field anymore — it was migrated away from and fully removed from the schema). Mirrored in Clerk as `publicMetadata.roles: string[]` (also plural — note the `s`, this was a deliberate rename from the original singular `role`).

`super_admin` is a strict superset of `league_admin` everywhere — every `league_admin`-only check must also allow `super_admin`. `program_admin` exists as a role/`ROLE_CONFIG` entry and a `DASHBOARD_PLACEHOLDERS` "Coming Soon" card, but **has no dedicated route or Convex functions of its own** — it was speculative scaffolding from Project 1 that nothing ever built on; `coach` was added as a distinct new role instead when Project 4 was built (see Gap Inventory).

**Shared role-check helper**: `hasAnyRole(roles: string[] | undefined, allowed: string[]): boolean` lives in **two places** (small deliberate duplication, not an oversight): `lib/roles.ts` (for `proxy.ts` and API routes — ordinary Next.js server code) and a private copy inside `convex/lib/auth.ts` (Convex's bundler only bundles within `convex/`, so it can't import from root `lib/`).

**`convex/lib/auth.ts`** exports 6 gate helpers, one query/mutation pair per privileged role: `requireLeagueAdminQuery/Mutation`, `requireRefereeQuery/Mutation`, `requireCoachQuery/Mutation`. All follow the identical pattern: read `identity["metadata"].roles` (JWT-embedded, fast path) first; if that doesn't match, fall back to a `users` table lookup by `by_clerk_id` and check `.roles` there. **Query variants return `null` on missing identity** (never throw — throwing leaves `useQuery` stuck in a permanent error state during the auth-token-arrival race on page load); **mutation variants throw** `"Not authenticated"` immediately (mutations aren't subject to that race). Both throw `"Forbidden"` on a present-but-wrong role. None of these helpers grant `league_admin`/`super_admin` an automatic bypass into referee/coach-gated Convex functions — that asymmetry is intentional-by-precedent (referee was built first this way, coach copied it for consistency) but is NOT mirrored in `proxy.ts`'s route matchers, which *do* let `league_admin`/`super_admin` through `/referee(.*)` and `/coach(.*)` — a known inconsistency, not a bug, if you notice it.

**Per-record ownership** (e.g. "is this game assigned to this referee", "is this game one of this coach's teams") is always checked **inline by the caller**, not folded into the shared role helpers — e.g. `convex/games.ts`'s `acceptGame`/`submitScore` do `if (game.refereeId !== identity.subject) throw new Error("Forbidden")` after calling `requireRefereeMutation`.

**Clerk JWT setup** (both the session token AND the separate `"convex"` JWT template need `"metadata": "{{user.public_metadata}}"` configured in the Clerk Dashboard — configuring only one is the single most common way role checks silently break. This is a **Clerk Dashboard config**, not code — nothing in this repo can fix it if it's missing.)

**Route guards** (`proxy.ts`): `/admin(.*)` → `league_admin`/`super_admin`; `/referee(.*)` → `referee`+admins; `/coach(.*)` → `coach`+admins. No guard exists for `/players` (any authenticated user can hit the route; the data itself is scoped by `guardianClerkId` inside the query).

---

## Convex Backend — File Map (verified via `ls convex/*.ts`)

| File | Purpose |
|---|---|
| `schema.ts` | Single source of truth, all 15 tables |
| `lib/auth.ts` | The 6 role-gate helpers described above |
| `users.ts` | `getCurrentUser`, `upsertUser`, `updateProfile`, `listAll` (admin), `syncFromWebhook`/`deleteByClerkId` (internal, driven by Clerk webhook) |
| `http.ts` | Clerk webhook handler (`user.created/updated/deleted`) at `/clerk-webhook` |
| `players.ts` | Guardian-scoped player CRUD (`listMyPlayers`) + `listAllPlayers` (admin, added for Project 4's roster builder) |
| `customTables.ts` | League-admin-only ad hoc data tables (`/admin/data`) — the one place `v.any()` is used, deliberately |
| `impersonation.ts` | `logStart` audit-log mutation for `super_admin` impersonation |
| `fields.ts`, `teams.ts` | Project 2 — scheduling primitives. `teams` also carries `clubId` (added in Project 4) |
| `games.ts` | Core game lifecycle: `createGame`/`updateGameSlot`/`cancelGame` (admin), `listGames` (admin), `listMyAssignedGames`/`acceptGame`/`submitScore` (referee) — `submitScore` also schedules the Stripe payout action |
| `referees.ts` | `getAvailableRefs` (conflict-free suggestion for a given game/slot), `assignReferee`/`unassignReferee` (admin) |
| `clubs.ts` | Admin CRUD for clubs, coach assignment, `listCoaches` |
| `rosters.ts` | Admin-only roster join-table CRUD (`addToRoster`/`removeFromRoster`/`listRosterForTeam`) |
| `coach.ts` | Coach-facing reads (`getMyClub`/`getMyRoster`/`getMySchedule`) + `verifyScore`/`flagDispute` |
| `disputes.ts` | Admin-facing `listOpenDisputes`/`resolveDispute` |
| `financials.ts` | League pay-rate settings, referee Stripe-account linking/status cache, payout ledger queries, `retryPayout` |
| `financialsActions.ts` | **`"use node";`** file — the only place Node-runtime code lives, since Convex requires files importing Node-only npm packages (here: `stripe`) to be isolated from query/mutation files. Contains `triggerStripePayout` (internal action), `startOnboarding`/`refreshMyPayoutStatus`/`refreshRefereePayoutStatus`/`createExpressDashboardLink` (public actions, referee/admin self-service Stripe Connect) |
| `documents.ts` | Project 7 — Convex File Storage upload flow, `getMyRequiredDocuments`/`acknowledgeDocument` |

**Convex operational notes** (all independently verified, not just recalled):
- `bunx convex dev --once` is what actually **pushes** schema/function changes to the dev deployment. `bunx convex codegen` alone only regenerates local `convex/_generated/*` TypeScript types — it does **not** push. If a newly-added function 404s when called via `bunx convex run` or from the client, you probably only ran `codegen`.
- **Schema field removal requires a 3-step migration**, not a direct delete: (1) add the new field as `v.optional(...)` alongside the old one, push; (2) write and run a one-time internal mutation that backfills the new field from the old one on every existing doc; (3) remove the old field from the schema entirely, push again. Directly deleting a field that existing documents still physically carry fails schema validation with `"Object contains extra field ... that is not in the validator"` — this happened during the `role` → `roles` migration and needed an extra intermediate push to fix.
- Environment variables needed by Convex **functions** (not just Next.js) must be set in **Convex's own environment**, separately from `.env.local` — via `bunx convex env set KEY value` or the Convex dashboard. This has bitten this project twice: `CLERK_WEBHOOK_SECRET` (Project 1) and `STRIPE_SECRET_KEY` (Project 5) both needed to be added to Convex's env, not just `.env.local`, before the corresponding Convex functions (webhook handler, `financialsActions.ts`) worked.
- Actions can't touch `ctx.db` directly — they call `ctx.runQuery`/`ctx.runMutation` against `internalQuery`/`internalMutation` functions defined in a regular (non-`"use node"`) file.

---

## Stripe Connect (Project 5 + later additions) — Real Gotchas

- **Business model on the Stripe dashboard: "Marketplace" (not "Platform")** — this platform is the one handling money in and sending payouts to referees (recipients), not a platform where each connected account processes its own customer charges.
- **A freshly created Stripe Connect account does NOT have the `transfers` capability active just because it exists.** It must complete (test-mode) onboarding first. Calling `stripe.transfers.create` against an account that hasn't finished onboarding fails with an error naming the missing `transfers`/`crypto_transfers`/`legacy_payments` capability. This is normal Stripe behavior, not a bug in this codebase — if a payout fails with that message, the fix is (re)completing onboarding for that connected account, and `/admin/financials` has a "Refresh Status" button plus `/referee`'s "Continue Onboarding" button for exactly this.
- **Payout timing is deliberate and developer-confirmed**: `submitScore` (referee submits a score) triggers the Stripe transfer **immediately**, before any coach verification/dispute step. This is intentional — referees are explicitly incentivized to submit scores right away because payment fires on submission. Project 6 (disputes) does **not** gate or claw back payment; `resolveDispute` only ever corrects the score record, never touches `payoutLedger` or calls Stripe. Do not "fix" this without asking — it was a deliberate developer decision made after explicit discussion, not an oversight.
- The 1.5% platform fee is captured by simply **not transferring that portion** — `stripe.transfers.create` only moves `netAmountCents` (gross minus fee) to the connected account; the fee amount stays in the platform's own Stripe balance automatically. No `application_fee_amount` is used (that parameter is for destination-charge flows, which don't apply here since there's no customer-facing charge, just a balance-to-recipient transfer).
- Referee's own Stripe **Express Dashboard** access (balance, payout history, bank info — all managed by Stripe, not built by this app) is via `stripe.accounts.createLoginLink(accountId)` — a fresh single-use link generated per visit, no persistent Stripe credentials for referees.
- Admin can still manually paste/override a referee's Stripe Connect account ID on `/admin/financials` as a support escape hatch, alongside the self-onboarding flow — both coexist deliberately.

---

## Frontend Conventions

- **`components/ui/data-table.tsx`**: generic `DataTable<T>` — desktop `<table>` (`hidden md:block`) + mobile card-per-row stack (`md:hidden`), same `columns`/`rows`/`getRowKey`/`renderActions`/optional `selection` props throughout the app. Reuse this for any new tabular admin view; don't build a new table component.
- **Admin CRUD page pattern** (established by `/admin/data`, repeated everywhere since — schedule/teams/fields, clubs, financials, exceptions, documents): `useQuery`/`useMutation` from `convex/react`, `ArloLoader` while `undefined`, inline-editable `Input` with `onBlur` commit for renames, a shared confirm-`Dialog` for deletes, everything inline in one client component file — no extracted subcomponent files for form pieces.
- **`app/admin/layout.tsx`**: `ADMIN_NAV` is a flat array rendered in both a desktop sidebar and a mobile hamburger overlay. Adding an admin page = append one entry here.
- **Client-side "gate" pattern** (used for `AcknowledgeGate`, and could be reused for similar future needs): a `"use client"` component with no visual output, mounted inside `<Show when="signed-in">` in `app/layout.tsx`, that `useQuery`s some Convex state and calls `router.replace(...)` when a condition is met. This is the deliberate substitute for doing the equivalent check inside `proxy.ts`'s Next.js Edge middleware, which can't cheaply call Convex per-request.
- **Hotkey navigation** (`components/hotkey-nav.tsx`): Gmail-style `g` then a letter (`gd`→dashboard, `ga`→admin, `gr`→referee, `gc`→coach, `gp`→players, `gu`→my profile), `?` toggles a help dialog. The `DESTINATIONS` array in that file is the source of truth for the current list — check it directly rather than trusting this bullet, since it gets extended over time (e.g. `gu` was added after this file was first written). Shortcuts are filtered to what the signed-in user's roles actually grant — a shortcut for a route the user can't access is never bound in the first place, not bound-then-redirected.
- **`components/dropdown-portal-select.tsx`**: a header portal switcher (Admin/Players/Referee/Coach/Program) — note it currently links to `/program`, which is **not a real route** (dead link) since `program_admin` has no dedicated page; flag this if you touch that component.

---

## Project Status (against `AGENTS.md`'s 7-project spec)

All 7 are built, but "built" means "the literal spec interaction works end-to-end," not "production-hardened for a real multi-league SaaS." See the Gap Inventory below for what's genuinely missing or shallow.

1. **Identity & User Registration** — done via Clerk role metadata (not Clerk Organizations — see gap below).
2. **Game Scheduling** — done: `fields`/`teams`/`games`, admin CRUD at `/admin/schedule`, double-booking prevention via `by_field_and_time` index check.
3. **Referee Management** — done: assign/accept flow, ARLO Alert for unassigned games within 48h on `/admin`.
4. **Program & Team Administration** — done, but as a **new `coach` role** (not `program_admin`) with a flat `clubs → teams` model (no Townships/Programs/Divisions/Counties nesting — see gap below).
5. **Financials & Reports** — done: real Stripe Connect test-mode transfers, referee self-onboarding, admin payout ledger. The league's *own* $299/mo subscription billing to the platform was never built (see gap below) — only the outbound referee-payout side exists.
6. **Dispute Resolution** — done: coach can dispute instead of verify, admin resolves via `/admin/exceptions`. Payout is never gated on this (see Stripe section above).
7. **Document Storage & Compliance** — done: admin uploads via Convex File Storage, per-document configurable `requiredForRoles` (not hardcoded to coaches, a deliberate generalization), hard client-side gate via `/acknowledge`.

**Beyond the original spec**: multi-role users (`users.roles: string[]`), Gmail-style hotkey navigation, a header portal-switcher dropdown.

---

## Gap Inventory & Roadmap (as of this writing — confirm still current before acting on it)

This was compiled by re-reading `AGENTS.md`'s SJYLAX section against the actual built code, then confirmed with the developer. **Developer-approved order for what's next: this list, roughly top to bottom, after finishing the polish/testing on what already exists.** Do not start any of these without re-confirming scope with the developer first — several involve real architectural forks.

### Fully missing (no plan has ever touched these)

1. **Organization/League multi-tenancy** — the schema is entirely flat and global. No table has an `orgId`/`leagueId`. **Developer's explicit decision (confirmed)**: do NOT retrofit multi-tenancy now. Treat this deployment as SJYLAX's own dedicated instance. But — and this is the important nuance — **when building anything below that touches organizational structure, model it generically** (e.g. a configurable-depth `orgUnit`/hierarchy concept with admin-defined level names, not hardcoded fields called `township`/`county`), so the same schema could describe a different league's tiers later without a rewrite. This is "build for one, design for many," not "build multi-tenant now."
2. **Location-based / residency assignment** — SJYLAX requires players to play for the township they live in, derived via: player → family primary address → sending school district → matching township program. Entirely unbuilt. `players` has no address field at all (only the guardian's `users.address` does, and that's just street/city/state/zip, no district concept). Would need a new geography/district table and matching logic, designed generically per point 1.
3. **Season setup** — no "season" entity exists anywhere. `games.startTime` is a raw timestamp with no season grouping. No blank/template/custom-template creation flow.
4. **Bulk scheduling operations** — `createGame` is strictly one-game-at-a-time via a dialog form. No CSV import, no recurring-game generation, no season-wide batch builder.
5. **Age/grade division eligibility** — SJYLAX provides a real per-season age-requirements spreadsheet, but nothing validates a player's grade/DOB against a division's bracket rules. `players.grade`/`dateOfBirth` exist but are never checked against anything.
6. **Communications system** — no messaging, no email/SMS notifications, no in-app announcements anywhere. Only Clerk's own auth/invite emails exist (sign-up confirmation, invitation emails) — nothing app-driven.
7. **SaaS subscription billing** — the CEO section of `AGENTS.md` describes a $299/mo/league platform fee in addition to the 1.5% referee-payout fee. Only the referee-payout side of Stripe was ever built; there's no Stripe Billing/Checkout integration for the league's own subscription to the platform.

### "Completed" projects with real, known gaps

- **Project 1 (Identity)**: spec called for Clerk **Organizations** (`<OrganizationSwitcher />`, `org_id` passed to every query) for multi-tenant league boundaries. This repo uses Clerk role metadata (`publicMetadata.roles`) instead — works fine for a single-league deployment, but is not the multi-tenancy mechanism the original spec described. Revisit this decision specifically (not just "note it") if/when multi-tenancy work above ever starts, since Clerk Organizations vs. a custom `orgId` scheme are two different paths with different migration costs.
- **Project 2 (Scheduling)**: no season concept (see gap #3 above) — the spec's `getGamesBySeason` was never literally buildable since there's no season to filter by; the actual function is `listGames` with an optional raw `from`/`to` timestamp range instead.
- **Project 4 (Program Admin)**: `clubs → teams` is a flat single level (one coach per club, a club has many teams) — nothing like SJYLAX's real Townships → Programs → Divisions → Counties nesting, and no residency-based auto-assignment (a player is added to a team's roster manually by an admin, not auto-matched by address).
- **Project 5 (Financials)**: only the outbound referee-payout half of Stripe exists (see gap #7 above — inbound league subscription billing was never built).

---

## Environment Variables (confirmed against `.env.local` presence, not just recalled)

Required in `.env.local` for local dev: `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`, `CLERK_WEBHOOK_SECRET`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (optional — address autocomplete degrades gracefully to a plain input if unset).

**`STRIPE_SECRET_KEY`**: needed in **Convex's own environment** (`bunx convex env set STRIPE_SECRET_KEY sk_test_...`), not `.env.local` — nothing in the Next.js/browser side calls Stripe directly, only the Convex action (`financialsActions.ts`) does. Adding it only to `.env.local` will look configured but silently fail every payout with `"STRIPE_SECRET_KEY is not configured"` in the `payoutLedger` failure reason.

**`CLERK_WEBHOOK_SECRET`**: needed in **both** `.env.local` and Convex's own environment (the webhook handler is a Convex HTTP action, running in Convex's environment, not Next.js's).
