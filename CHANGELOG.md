# Changelog

Project history is tracked through git branches. Each branch represents a feature or phase of work. Read `MEMORY.md` for architecture context before reading this file.

---

## Branch: `feat/orgs-via-clerk`

**Status**: In progress — pushed to origin, not yet merged. Vercel preview deployment is live. Running in parallel with a separate branch, `feat/orgs-via-convex` (built by a background agent, Convex-native multi-tenancy with no Clerk Organizations), as a deliberate architecture bake-off. **No decision has been made on which branch wins** — don't treat this branch as canonical over the other without asking.

**Purpose**: Close the single biggest gap flagged in `development`'s gap inventory — the schema was entirely flat/global with no `orgId` anywhere, despite the original `AGENTS.md` spec calling for Clerk Organizations multi-tenancy from Project 1. This branch rebuilds identity, then layers three more roadmap projects on top of the resulting tenant boundary.

Full architectural and file-level detail lives in `MEMORY.md` (rewritten for this branch) — this entry is the chronological/decision record; read `MEMORY.md` first for how the pieces fit together.

### What was built, roughly in order

1. **Multi-tenancy foundation (Project 1 rebuild)** — Clerk Organizations enabled; every business table gained `orgId: v.string()` (the Clerk org id). Two-layer role model: Clerk's native `org:admin`/`org:member` for cheap Edge-middleware checks in `proxy.ts`, plus a new `orgMemberships` Convex table (`clerkId`, `orgId`, `roles: string[]`) synced from Clerk organization-membership `public_metadata` via new `organizationMembership.*` webhook handlers, for the app's own multi-value `AppRole`s Clerk's binary org role can't express. `convex/lib/auth.ts`'s gate helpers were rewritten to take `orgId` explicitly and resolve roles via `orgMemberships` instead of the old JWT-metadata-then-users-table pattern. New `organizations` table denormalizes Clerk Orgs for a `super_admin`-only `/admin/organizations` cross-org view.
2. **QA bug-fix pass** — fixed stale global-role checks left over from the pre-multi-tenancy code, ugly raw-error surfacing on `/admin/organizations`, missing delete-protection for `super_admin` accounts, a cross-tenant access issue, and a race where a user with a real role in one org appeared to have no portal access after switching orgs (proxy.ts referee/coach route staleness) plus a gap in the invite flow.
3. **Portal dropdown gating** (`components/dropdown-portal-select.tsx`) — gated to only show portals the signed-in user's roles actually grant (via `orgMemberships.getMyRoles`), fixed a dropdown-open layout shift in the header, and it now shows the current portal's name instead of a static "Select Portal" label when the route matches.
4. **Generic org hierarchy wired into clubs/teams (Project #1 depth pass)** — new self-referencing `orgUnits` table (arbitrary depth, free-text `unitType`, not a fixed enum) with full CRUD and ancestor-walk helpers (`isDescendant`/`isSameOrDescendant`). `clubs`/`teams` both gained `orgUnitId` — optional at the schema level (pre-existing rows), but required going forward via `createClub`/`createTeam`. `/admin/org-units` is the hierarchy builder; `/admin/clubs` and `/admin/schedule/teams` stay the primary places admins manage teams, with just a hierarchy-placement field bolted on (deliberate scope decision — the hierarchy builder was NOT made the primary navigational home yet).
5. **Location-based residency assignment (Project #2 depth pass)** — SJYLAX's real requirement: players must play for the township they live in, derived from the guardian's address. New `convex/residency.ts`: a Census Bureau Geocoding API action (free, no key) resolves a guardian's address to a school sending-district, cached on `users.residency`. New `districtMappings` (district → orgUnit, org-scoped) and `unmappedDistrictReports` (logs resolved-but-unmapped districts for admin review) tables. Enforcement is a **hard block with admin override**: `rosters.addToRoster` rejects adding a player to a team outside their resident district unless the caller supplies a non-empty `overrideReason`, stored as an audit trail on the roster row.
6. **Season setup (Project #3)** — new `seasons` table; `games.seasonId` (optional at the schema level, required going forward via `createGame`). `useCurrentSeason()` picks the season whose date range contains "now," falling back to most-recently-created. A backfill migration for pre-season-tracking games (`convex/migrations/backfillDefaultSeason.ts`) was written and dry-run-verified but **the developer explicitly ordered it not be run** ("it is not needed") — it remains unexecuted by design, not an oversight.
7. **Bulk scheduling / round-robin generation (Project #4)** — this also resolved a foundational gap the developer flagged directly mid-project: `orgUnits` (place) and `seasons` (time) had no connecting entity, so "which teams are in Division X this season" wasn't answerable. New `teamSeasonPlacements` table (`orgId`/`seasonId`/`teamId`/`orgUnitId`, one placement per team per season) is now the authoritative source for that question — `teams.orgUnitId` becomes just a prefill default. New `/admin/schedule/bulk` page: season+org-unit pickers, a team-placement panel (add/remove/copy-from-previous-season), a round-robin generation form (start date/day-of-week/time/fields), a conflict-flagged preview (reusing `games.ts`'s newly-exported `hasFieldConflict`), and an all-or-nothing commit. CSV import was explicitly scoped out of V1 in favor of auto-generated round-robin only.

### Notes

- Every Convex push in this branch's history has gone to the real cloud dev deployment `calculating-eel-369` (project `1822lax:c4studio-arlo-user-portal`) — confirmed correct after one near-miss where a stale shell working directory (left over from starting `feat/orgs-via-convex`'s dev server in its worktree) almost caused a `convex dev --once` to target that worktree's local anonymous backend instead. No actual damage occurred; see `MEMORY.md`'s worktree-hazard note for the standing mitigation (`pwd && git branch --show-current` before any Convex/git command).
- Manual browser verification still needed for the bulk-scheduling flow specifically: place 4–6 teams into a season+org-unit (including via "copy from previous season"), generate a preview and confirm every team plays every other exactly once with no duplicate matchups, intentionally collide with an existing game and confirm the conflict badge blocks commit, then commit a clean preview and confirm the games appear on `/admin/schedule`.
- Residency enforcement, org-hierarchy CRUD, and the org-membership webhook sync were all previously confirmed working by the developer directly in-browser (per-branch prior sessions) — not re-verified in the bulk-scheduling session.

---

## Branch: `feat/ui-ux-fixes`

**Status**: In progress — not yet merged.

**Purpose**: Clean up five UI/UX issues that accumulated across recent feature branches. Built as four independent sub-tasks (disjoint files) via parallel isolated agents, then merged into this branch.

### What was built

- **`components/ui/data-table.tsx`** (new) — Generic `DataTable<T>` component: desktop view wraps the existing `<table>` markup in `overflow-x-auto` (fixes actions-column clipping on `/admin/users`, where the Impersonate/Delete buttons were previously inaccessible with no way to scroll to them); mobile view (`md:hidden`) renders one `Card` per row with label/value pairs and full-width stacked action buttons — a deliberate "power user" mobile answer (dense, scannable fields + full-width tap targets) rather than a shrunk table or horizontal scroll. Applied to `app/admin/users/page.tsx` and `app/admin/data/[tableId]/page.tsx` (the two real data tables in the app; `/players` already used a card grid and is unaffected) with zero changes to existing state/handler logic — only how rows render.
- **`app/admin/layout.tsx`** — Converted from a horizontal top nav bar to a standard admin-dashboard left sidebar (`hidden md:flex md:w-56 md:flex-col md:border-r`, vertical `ADMIN_NAV` links). On mobile, the sidebar is replaced by a slim top bar with a hamburger button (`lucide-react`'s `Menu`/`X` icons, already a dependency) that opens a fixed-overlay nav panel; tapping a link or the backdrop closes it.
- **`app/api/admin/exit-impersonation/route.ts`** — Exiting impersonation now redirects to `/admin/users` (where a `super_admin` would typically have clicked "Impersonate" from) instead of `/dashboard`. Entering impersonation is unchanged — still targets `/dashboard`.
- **`components/address-autocomplete.tsx`** (new) — Google Places Autocomplete for the Street field on `/user/edit`, the only existing address form in the app. Loads the Google Maps JS API `places` library via `next/script` using `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — no new npm dependency, just the script tag plus a small locally-typed interface for the parts of `window.google.maps.places` actually used (zero `any`). Falls back to a plain working text input when the key is unset (no crash, no broken page). Selecting a suggestion auto-fills street/city/state/zip; City/State/Zip remain manually editable afterward.

### Notes

- **Setup required, not yet done**: add a real `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to `.env.local` (and Vercel) for autocomplete to actually show suggestions. Requires a Google Cloud project with the Places API enabled, an API key restricted to this app's HTTP referrers, and billing enabled on the project (required even within the free tier).
- One sub-task's isolated worktree branched off a very stale ancestor (predating the admin dashboard, custom data, players, and impersonation work entirely) instead of the current `development` tip — merging it as pushed would have deleted ~2700 lines of already-merged functionality. Caught during review before merging; the genuine new content (`components/address-autocomplete.tsx` and the `app/user/edit/page.tsx` wiring) was extracted and reapplied directly on the correct base instead of merging the branch itself.
- Manual browser testing still needed: resize to ~375px and desktop widths on `/admin/users`, `/admin/data/[tableId]`, and all `/admin/*` pages (sidebar/hamburger behavior); click through impersonate/exit to confirm the new landing pages; test address autocomplete once a real API key is configured.

---

## Branch: `feat/user-impersonation` (merged)

**Status**: Merged into `development` via PR #10.

**Purpose**: Let a new `super_admin` role (strict superset of `league_admin`, plus impersonation — no target restrictions, no reason field, per explicit product decision) sign in as any other user for support purposes, using Clerk's native Actor Token API rather than a custom session-swap.

### What was built

- **`lib/roles.ts`** — Added `"super_admin"` to `AppRole` and a `ROLE_CONFIG` entry ("All League Admin permissions" + "Impersonate any user account"). `DASHBOARD_PLACEHOLDERS`'s exclude type grew to also exclude `super_admin`, which gets the same real `AdminLinkCard` as `league_admin` rather than a placeholder.
- **`app/dashboard/page.tsx`, `app/admin/page.tsx`** — Extended the `league_admin`-only checks/records to also include `super_admin` (dashboard admin card, League Overview role-count breakdown).
- **`proxy.ts`** — The `/admin(.*)` gate is now an allowlist of `league_admin`/`super_admin` instead of a single-role check.
- **`convex/schema.ts`** — Added `impersonationEvents` (`adminClerkId`, `targetClerkId`, `startedAt`), indexed `by_admin` and `by_target` — the audit trail, since there's no reason field or target restriction to otherwise constrain this feature.
- **`convex/impersonation.ts`** (new) — `logStart` mutation, gated `super_admin`-only via the same JWT-then-DB-fallback pattern as `users.listAll`. It's a public `mutation` (not `internalMutation`) because it's invoked from a Next.js Route Handler via `ConvexHttpClient`, which can only call public functions — it independently re-verifies the caller's role rather than trusting the route handler's own check, consistent with how every other Convex function in this app re-checks role itself (defense in depth).
- **`app/api/admin/impersonate/route.ts`** (new) — `super_admin`-only. Calls `clerkClient().actorTokens.create({ userId: targetClerkId, actor: { sub: callerId } })` (Clerk's purpose-built impersonation primitive — the resulting session carries a tamper-proof `actor` claim identifying the real admin). Builds its own redemption URL from the raw `actorToken.token` (`/sign-in?__clerk_ticket=...`) rather than using `actorToken.url` — see Bugs Fixed below. Logs the audit event via a `ConvexHttpClient` call forwarding the caller's Convex JWT (`getToken({ template: "convex" })`) — audit-log failures are logged server-side but never block impersonation itself. Returns `{ url }` for the client to navigate to.
- **`app/api/admin/exit-impersonation/route.ts`** (new) — No target/role param needed: reads `auth().actor.sub` (the admin's real Clerk ID, cryptographically embedded in the current impersonated session's JWT) and calls `clerkClient().signInTokens.createSignInToken({ userId: actor.sub, expiresInSeconds: 60 })` — a normal sign-in ticket, not another actor token, since this returns the admin to their own account with no `actor` claim. Same redemption-URL-building pattern as the impersonate route.
- **`app/admin/users/page.tsx`** — Added `"super_admin"` to the `ROLES` array; a per-row "Impersonate" button (visible only when the acting user's own Convex-sourced role is `super_admin`, disabled on your own row) behind the existing shared-`Dialog` confirmation pattern (non-destructive styling, unlike Delete). On confirm: POSTs to `/api/admin/impersonate`, signs out of the current session, then does a full `window.location.href` navigation to the returned ticket URL.
- **`components/impersonation-banner.tsx`** (new) — Client component checking `useAuth().actor`; renders "Viewing as {current user's name} (impersonation)" with an "Exit impersonation" button whenever an actor claim is present. On click: POSTs to `/api/admin/exit-impersonation`, signs out, navigates to the returned ticket URL. Mounted in `app/layout.tsx` between the header and `{children}`.

### Bugs fixed during this branch

- **Impersonation redirected to Clerk's hosted Account Portal** (`*.accounts.dev/default-redirect`) instead of this app: `ActorTokenCreateParams` has no `redirectUrl` field (unlike the invitation API), so `actorToken.url` defaulted to the Account Portal. Fixed by ignoring `.url` and building a same-app URL from the raw `.token` instead.
- **`super_admin` got "Forbidden" calling `listAll`** despite the role existing: adding the role tier only updated page-level gates (`proxy.ts`, dashboard pages) — the actual `league_admin`-only checks inside `convex/users.ts`, `convex/customTables.ts`, and the `VALID_ROLES` arrays in `app/api/users/{role,delete,invite}/route.ts` were missed on the first pass. Fixed by grepping the whole repo for `"league_admin"` and updating every match to an allowlist.
- **Impersonation appeared to "work" (redirected into the app) but the admin was still signed in as themselves**: Clerk silently ignores a sign-in ticket (`__clerk_ticket`) whenever a session is already active — redeeming into a session alongside an existing one requires Clerk's paid multi-session feature. Fixed without relying on multi-session: `clerk.signOut()` runs client-side immediately before navigating to any ticket URL, both entering and exiting impersonation. This is also why exit uses a fresh `signInTokens.createSignInToken()` (a normal ticket) targeting `auth().actor.sub`, rather than trying to restore a coexisting original session via `setActive` — there is no coexisting session in single-session mode, so nothing to switch back to.

### Notes

- No `session.created`/session-level webhook handling was added — Clerk fires no distinguishable webhook for actor-token sign-ins (`user.*` webhooks still carry the *target's* real Clerk ID), so the existing `convex/http.ts` webhook handler needed no changes and can't be used for impersonation-start auditing; the audit write happens directly from the API route instead.
- `bunx convex codegen` ran successfully against the real dev deployment for this branch (unlike the last two branches, which had no deployment credentials in their isolated worktrees and required hand-editing `convex/_generated/api.d.ts`) — `impersonationEvents` is live in the actual schema.
- Manual browser testing still needed: promote a test account to `super_admin`, impersonate another account, confirm the banner and app behave as that user, exit impersonation and confirm return to the real account.

## Branch: `feat/player-registration` (merged)

**Status**: Merged into `development` via PR #9.

**Purpose**: Give `family`-role users player profile CRUD (their children) — no registration flow, no season/program/team concept, no payments. Programs, Teams, and Game Scheduling are separate future projects and `players` does not reference them (no `programId`/`teamId`/`season`).

### What was built

- **`convex/schema.ts`** — Added a `players` table: `guardianClerkId` (string, mirrors the `users.clerkId`/`by_clerk_id` convention rather than referencing `users._id`, so it survives even if the guardian's own `users` doc doesn't exist yet), `firstName`, `lastName`, `dateOfBirth` (required strings), `gender`/`school`/`grade` (optional strings). Indexed `by_guardian` on `guardianClerkId`.
- **`convex/players.ts`** (new) — `listMyPlayers` (query, returns `null` on missing identity — same "never throw in a query" pattern as `users.listAll`/`getCurrentUser`), `createPlayer`, `updatePlayer` (ownership check: throws `"Forbidden"` if `player.guardianClerkId !== identity.subject`), `deletePlayer` (same ownership check). No admin-wide "all players" query — deliberately out of scope.
- **`components/players/player-form.tsx`** (new, shared) — Client component form used by both create and edit pages. First/last name in a two-column grid, DOB date input, a native `<select>` for gender, School/Grade inputs. Submit label and disabled-while-submitting state driven by `mode: "create" | "edit"`.
- **`app/players/page.tsx`** (new) — Lists the signed-in family's players as cards (name, DOB, school/grade), "Add Player" link in the header, per-card Edit/Delete actions. Delete reuses the same `pendingDelete`/`deleteSubmitting` + shared `Dialog` confirmation pattern as `app/admin/users/page.tsx`. Empty state prompts the user to add their first player.
- **`app/players/new/page.tsx`** (new) — Renders `<PlayerForm mode="create">`, calls `createPlayer`, redirects to `/players`.
- **`app/players/[playerId]/edit/page.tsx`** (new) — Client component; unwraps the Next.js 16 `params` Promise with React's `use()` (no dedicated single-player query — finds the player client-side in the small `listMyPlayers` result). Redirects to `/players` via `useEffect` if the id doesn't match any of the caller's players (not found or belongs to someone else).
- **`lib/roles.ts`** — Narrowed `DASHBOARD_PLACEHOLDERS` to `Record<Exclude<AppRole, "league_admin" | "family">, ...>` and removed the `family` placeholder entry, since `family` now has a real dashboard destination.
- **`app/dashboard/page.tsx`** — Three-way conditional: `league_admin` → existing `AdminLinkCard`, `family` → new `PlayersLinkCard` (links to `/players`), everything else → `RolePlaceholderCard` (prop type narrowed to match `DASHBOARD_PLACEHOLDERS`).

### Notes

- No `proxy.ts` changes — `/players(.*)` already falls under the default "any authenticated user" path.
- This worktree had no Convex deployment credentials available, so `convex/_generated/api.d.ts` (normally regenerated by `convex dev`) was hand-edited to add the `players` module declaration; `api.js` uses `anyApi` at runtime so no runtime regeneration was required for typechecking/build to pass. Whoever picks this up next should run `bunx convex dev` once to let Convex regenerate this file for real and confirm it matches.
- Manual browser testing still needed (no real Clerk session available in this environment): add a player, refresh to confirm persistence, edit a player, delete a player, and confirm a second family account cannot see or edit the first family's players.
## Branch: `feat/admin-custom-data` (merged)

**Status**: Merged into `development` via PR #8.

**Purpose**: Give `league_admin` a "sandbox" to define their own data tables (name + columns + types) at runtime and manage rows in a generic grid — for league-specific data the developers can't predict ahead of time (e.g. equipment inventory, volunteer hours). This is a deliberate, isolated exception to the project's strict-TypeScript/zero-`any` rule.

### What was built

- **`convex/schema.ts`** — Added `tableDefinitions` (admin-defined table name + an array of column definitions: server-generated stable `key`, editable `label`, `type` union of text/number/date/boolean/select, optional `options` for select) and `customRecords` (`tableId` + `data: v.record(v.string(), v.any())`, keyed by column `key`). This is an EAV/meta-schema pattern — Convex has no runtime "create a table" API, so admin-defined tables are simulated rather than literal.
- **`convex/customTables.ts`** (new) — `listTables`/`getTable` (queries, `league_admin`-gated using the same JWT-metadata-then-DB-fallback pattern as `users.listAll`, return `null` not throw on missing identity), `createTable`/`addColumn`/`renameColumn`/`deleteColumn`/`deleteTable`/`addRecord`/`updateRecord`/`deleteRecord` (mutations). `deleteColumn` does **not** cascade-clean existing record data (orphaned values are left in place — inert, cheap, avoids an expensive fan-out); `deleteTable` does cascade-delete its records. `v.any()` is confined to this file and the two schema fields above — nowhere else in the app.
- **`app/admin/data/page.tsx`** (new, route `/admin/data`) — Grid of existing tables, "New Table" dialog (name + repeatable column builder: label, type, conditional options for "select") with plain-language warning copy about the lack of type safety (see below).
- **`app/admin/data/[tableId]/page.tsx`** (new) — Manage Columns section (inline rename, delete behind the existing `Dialog` confirm pattern, condensed warning copy) plus a record grid (native `<table>`, one column per `tableDefinitions.columns` entry) with add/edit/delete via a type-driven form. Column type → input rendering/coercion uses an exhaustive `switch` (`never`-checked) so the *rendering code* stays fully typed even though the *stored data* isn't.
- **`app/admin/layout.tsx`** — Added `{ href: "/admin/data", label: "Data" }` to `ADMIN_NAV`.

### Non-technical admin warning copy

Shown in full at table creation, condensed in the columns editor:

> "This tool doesn't check your work the way a spreadsheet formula might — it won't catch typos, and it will let you type 'banana' into a Quantity field without complaint. If you rename or remove a column later, any data already saved under the old column may become invisible or hard to find, even though it isn't actually deleted. Take a moment to get your column names and types right before you start entering real data."

### Notes

- No `proxy.ts` changes — `/admin(.*)` was already gated to `league_admin`.
- `convex/_generated/api.d.ts` was hand-edited to add the `customTables` module declaration (no live Convex deployment credentials available in the build environment to run `npx convex dev`/codegen). The runtime `api.js` uses `anyApi`, so this only affects typechecking, not behavior — still, someone with deployment access should run `npx convex dev` once to properly regenerate the file and push the new `tableDefinitions`/`customRecords` tables to the schema.
- Manual browser testing still needed (couldn't be done in this environment — no real Clerk session available): as `league_admin`, create a table with one column of each type, add/edit/delete records exercising every input, rename and delete columns and confirm no crash, delete a whole table and confirm its records are gone, and confirm a non-admin hitting `/admin/data` redirects to `/dashboard`.

---

## Branch: `feat/admin-dashboard` (merged)

**Status**: Merged into `development` via PR #7.

**Purpose**: Give `/admin` a real landing page (stats + quick links), add nav between admin pages, and stop `/dashboard` from duplicating admin stats.

### What was built

- **`app/admin/page.tsx`** (new, route is `/admin`) — League Overview widget (total users + per-role breakdown, moved from `/dashboard`'s old `AdminOverviewCard`, reusing the existing `listAll` query — no new Convex code) plus a "Manage Users" quick-link card to `/admin/users`.
- **`app/admin/layout.tsx`** (new) — Shared nav (Dashboard/Users tabs, active-tab highlighting via `usePathname`) for the admin section.
- **`app/dashboard/page.tsx`** — Removed the `AdminOverviewCard` stats widget for `league_admin`; replaced with a simple "Open Admin Dashboard" link card to `/admin`, so admin stats live in one place instead of two.
- **`app/admin/loader/`** — Removed entirely (no longer needed). It briefly existed inside a `(dashboard)` route group so the admin nav wouldn't wrap it; once the page itself was deleted, the route group was flattened back to a plain `app/admin/layout.tsx`/`page.tsx`/`users/page.tsx` structure.
- **`app/api/users/invite/route.ts`** (new) — `league_admin`-only route that calls `clerkClient().invitations.createInvitation({ emailAddress, publicMetadata: { role } })`. Clerk emails the invite and, on acceptance, automatically copies that `publicMetadata` onto the new user — the existing `user.created` webhook then syncs `role` into Convex with no new backend code. Returns 403 (wrong role), 400 (invalid email/role), or 409 (duplicate invite/existing account).
- **`app/admin/invite/page.tsx`** (new, route is `/admin/invite`) — Email + role form posting to the new route, with inline success/duplicate/error states. Added to the admin nav (`app/admin/layout.tsx`) and as a third quick-link card on `/admin`.
- **`app/admin/users/page.tsx`** — Added an "Invite User" link in the page header (admins expect a way to invite from the same page they manage users, not just via nav) and a "Delete" button per row, gated behind a new `components/ui/dialog.tsx` (shadcn) confirmation dialog. Self-deletion is disabled client-side (mirrors the server-side guard).
- **`app/api/users/delete/route.ts`** (new) — `league_admin`-only route calling `clerkClient().users.deleteUser()`. Blocks a caller from deleting their own account (400). Clerk fires `user.deleted` on the same `/clerk-webhook` endpoint already used for role sync — one endpoint handling multiple event types, not a second webhook.
- **`convex/users.ts`** — Added `deleteByClerkId` internal mutation (removes the matching `users` row, no-ops if already gone).
- **`convex/http.ts`** — Added a `user.deleted` branch to the existing webhook handler, calling `deleteByClerkId`.

### Bugs fixed

- **Invite emails linked to Clerk's hosted Account Portal** (`*.accounts.dev/sign-up`) instead of this app's own `/sign-up` page: `createInvitation` was missing `redirectUrl`. Fixed by passing `redirectUrl: new URL("/sign-up", request.url).toString()` — Clerk appends the invitation ticket, and the existing `<SignUp />` component handles ticket-based sign-up automatically.

### Notes

- No Convex schema changes — `deleteByClerkId` uses the existing `users` table/index.
- No `proxy.ts` changes needed — `/admin(.*)` was already gated to `league_admin`, redirecting elsewhere to `/dashboard`.
- `user.deleted` has been enabled on the Clerk webhook subscription and end-to-end deletion confirmed working (Clerk account removed → Convex row removed).

---

## Branch: `feat/user-dashboard`

**Status**: In progress — open PR, not yet merged to `development`.

**Purpose**: Introduce a `/dashboard` route as the post-login landing page, showing dynamic, role-specific content. Static profile information moves to its own `/user` (read-only) and `/user/edit` (edit) pages, linked from a new "My Profile" link in the header.

### What was built

- **`app/dashboard/page.tsx`** (new landing page, replaces `/user` as the `/` redirect target) — Shows only dynamic, role-specific content: `AdminOverviewCard` for `league_admin` (reuses the existing `listAll` query to show a live total-user-count and per-role breakdown, no new Convex query needed) or `RolePlaceholderCard` for `family`/`referee`/`program_admin` (a "coming soon" card, since no backend data models exist yet for those features in this repo). Still runs the `upsertUser` sync-on-login effect. Role is read from the canonical Convex `profile.role` (via the existing `getCurrentUser` query) rather than Clerk's client-cached `publicMetadata.role`, avoiding a stale-JWT edge case right after a role change.
- **`app/user/page.tsx`** (new, read-only) — Avatar/name/email header, read-only Profile Details (phone/DOB/address), and the Permissions card (role badge + description + permissions list). Links to `/user/edit`.
- **`app/user/edit/page.tsx`** (unchanged content, still exists) — The phone/DOB/address edit form; save/cancel now return to `/user` instead of the old `/user` (pre-dashboard) or the previously-attempted `/dashboard/edit`.
- **`lib/roles.ts`** — Added `DASHBOARD_PLACEHOLDERS`, a `Record<Exclude<AppRole, "league_admin">, { title, description }>` map, typed so adding a new `AppRole` without updating it is a compile error.
- **`proxy.ts`, `app/page.tsx`** — Redirect targets point to `/dashboard` (not `/user`).
- **`app/layout.tsx`** — Added a "My Profile" link in the signed-in header pointing to `/user`.

### Notes

- No Convex schema or query changes — this was UI/routing work only.
- Mid-branch correction: an earlier version of this work folded the profile/permissions UI into `/dashboard` and moved profile editing to `/dashboard/edit`, treating `/dashboard` as a full replacement for `/user`. That was wrong — `/dashboard` is for dynamic, role-specific content only; profile details/permissions belong on their own `/user` and `/user/edit` pages. Corrected before merge.

---

## Branch: `feat/admin-user-search` (merged)

**Status**: Merged into `development` via PR #5. Branch deleted from GitHub. Not yet merged to `main`.

**Purpose**: Add search to the admin user table and improve the loading UX across the app.

### What was built

- **`app/admin/users/page.tsx`** — Added a search input filtering the user list by first name, last name, or email (client-side, case-insensitive substring match). "Select all" now scopes to the currently visible (filtered) rows, and the card title shows an `(N of M)` count while a search is active.
- **`components/ui/arlo-loader.tsx`** — New shared loading component: an animated "arlo" wordmark using a Tailwind-only wipe/blur effect (mask + `@keyframes` defined in `app/globals.css` as `arlo-wipe` and `arlo-blur`, referenced via Tailwind arbitrary `[animation:...]` syntax).
- **`app/user/page.tsx`, `app/user/edit/page.tsx`, `app/admin/users/page.tsx`** — Replaced plain "Loading..." text with `<ArloLoader />`.
- **`app/admin/loader/page.tsx`** — New `league_admin`-gated page (via existing `/admin/*` proxy guard) that renders only `ArloLoader`, indefinitely — useful as a standalone loading/holding screen.

### Known issue

- **`ArloLoader` animation does not render** — the page loads and shows the static "arlo" wordmark, but the wipe/blur animation isn't visibly playing. Root cause not yet identified; suspect the Tailwind arbitrary `[animation:...]` value (two comma-separated animations, each with a `cubic-bezier(...)` function call) may not be parsing/generating correctly under Tailwind v4's arbitrary-value syntax. Needs follow-up investigation — try verifying the generated CSS output, or fall back to a `<style jsx>`/plain CSS class if the arbitrary-value approach proves unreliable.

---

## Branch: `feat/admin-role-management` (merged)

**Status**: Merged into `development` and confirmed working on the Vercel development deployment. Branch deleted from GitHub. Not yet merged to `main`.

**Purpose**: Allow league admins to assign roles to users from within the app instead of the Clerk Dashboard.

### What was built

- **`app/admin/users/page.tsx`** — Role management table at `/admin/users`. Lists all users (from Convex) with their current role, and a select dropdown to change it. Calls `POST /api/users/role` on change. Optimistic UI update while the webhook propagates.
- **`app/api/users/role/route.ts`** — Server-side route handler. Verifies the caller has `league_admin` role via `sessionClaims`, then calls `clerkClient().users.updateUser()` to write the new role to Clerk `publicMetadata`.
- **`convex/http.ts`** — Convex HTTP router with a `POST /clerk-webhook` handler. Verifies svix signature, handles `user.created` and `user.updated` events, calls `syncFromWebhook` internalMutation to keep Convex in sync.
- **`convex/users.ts`** — Added `listAll` query (league_admin only, returns all users) and `syncFromWebhook` internalMutation. Updated `upsertUser` to patch existing records (not just insert) so Clerk data stays current in Convex.
- **`proxy.ts`** — Added `/admin/*` route guard. Redirects non-`league_admin` users to `/user`.
- **`convex/schema.ts`** — Added `email` and `role` fields to the `users` table.
- **`lib/roles.ts`** — Single source of truth for `AppRole` type and role config (label, description, permissions list).
- **Batch role editing** — `app/admin/users/page.tsx` now has per-row and select-all checkboxes with a bulk action bar to apply one role to multiple selected users at once. `app/api/users/role/route.ts` accepts `userIds: string[]` and updates Clerk in parallel.

### Bugs fixed during this branch

- **Intermittent "Unauthorized" on `/admin/users`** (1-in-5 load rate): `listAll` was throwing when `getUserIdentity()` returned null during the Convex auth token initialization race. Fixed by returning `null` instead of throwing — Convex re-runs the query when the token arrives.
- **Admin table showing no user data**: `upsertUser` was returning early on existing records without updating fields. Fixed to always patch `firstName`/`lastName`/`email`. Effect in `app/user/page.tsx` now runs on every login (not just when `profile === null`).
- **Debug route breaking production build**: A top-level `throw` in `app/api/debug/user-tokens/route.ts` was evaluated at build time by Turbopack. Route was removed entirely.
- **`any` types in `app/api/users/role/route.ts` and `convex/http.ts`**: Both cast Clerk claim/webhook payloads through `any`, violating the project's strict-TypeScript rule. Replaced with a typed `{ role?: AppRole }` cast for session claims and a `ClerkUserEvent` interface for the webhook payload.
- **Clerk webhook failing silently**: Registered in the Clerk Dashboard but `CLERK_WEBHOOK_SECRET` was only set in `.env.local`, not in Convex's own environment variables — Convex HTTP actions run in Convex's environment, not Next.js's. Added the secret to the Convex dashboard.

### Completed

- Clerk webhook registered and confirmed working end-to-end (`user.created` / `user.updated` → Convex sync).
- `convex/migrations.ts` (temporary seed migration) deleted now that the webhook reliably keeps Convex in sync.
- `adminrolemanagement.patch` was already absent from the repo root.

Merged into `development` on 2026-07-03; ready to promote to `main` when the team decides.

---

## Branch: `main` (prior to `feat/admin-role-management`)

**Commits** (most recent first):
- `f43ac06` — Add Permissions section to user page (role badge + permissions list from `lib/roles.ts`)
- `f7ddfd9` — Remove firstName/lastName from Convex schema; names are read from Clerk only
- `d586309` — Add user profile page with Convex schema and Clerk integration
- `e51f879` — Add Clerk authentication and Convex backend
- `422c45a` — Initial commit from Create Next App

### What was built on main

- Clerk authentication with `proxy.ts` (Next.js 16 middleware equivalent)
- Convex backend with `users` table, `getCurrentUser`, `upsertUser`, `updateProfile` functions
- User profile page at `/user` showing name, avatar, email, and league-specific fields (phone, DOB, address)
- Edit profile page at `/user/edit` for phone, DOB, and address only (Clerk owns name/email)
- Permissions card on profile showing current role badge and permissions list
- `ConvexClientProvider` using `ConvexProviderWithClerk`
- shadcn/ui components: Avatar, Badge, Card, Button, Separator, Input, Label, Select

### Key decisions made on main

- **Clerk owns name/email/password**. Convex only stores league-specific data. Name fields were initially added to Convex schema but then removed via migration.
- **Role stored in Clerk `publicMetadata.role`**, not a separate Convex roles table. Denormalized/cached to Convex for admin list queries.
- **Session token vs Convex JWT template** are two different tokens. Both need `"metadata": "{{user.public_metadata}}"` configured separately in the Clerk Dashboard.
