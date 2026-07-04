# Changelog

Project history is tracked through git branches. Each branch represents a feature or phase of work. Read `MEMORY.md` for architecture context before reading this file.

---

## Branch: `feat/admin-custom-data`

**Status**: In progress — not yet merged. Branched from `feat/admin-dashboard` (not `development`), since it depends on that branch's `app/admin/layout.tsx`, `components/ui/dialog.tsx`, and `components/ui/arlo-loader.tsx`, which haven't merged to `development` yet. Merge `feat/admin-dashboard` first.

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

## Branch: `feat/admin-dashboard`

**Status**: In progress — open PR, not yet merged to `development`.

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
