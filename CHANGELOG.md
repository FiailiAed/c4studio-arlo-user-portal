# Changelog

Project history is tracked through git branches. Each branch represents a feature or phase of work. Read `MEMORY.md` for architecture context before reading this file.

---

## Branch: `feat/admin-role-management`

**Status**: In progress — open PR, not yet merged to `main`

**Purpose**: Allow league admins to assign roles to users from within the app instead of the Clerk Dashboard.

### What was built

- **`app/admin/users/page.tsx`** — Role management table at `/admin/users`. Lists all users (from Convex) with their current role, and a select dropdown to change it. Calls `POST /api/users/role` on change. Optimistic UI update while the webhook propagates.
- **`app/api/users/role/route.ts`** — Server-side route handler. Verifies the caller has `league_admin` role via `sessionClaims`, then calls `clerkClient().users.updateUser()` to write the new role to Clerk `publicMetadata`.
- **`convex/http.ts`** — Convex HTTP router with a `POST /clerk-webhook` handler. Verifies svix signature, handles `user.created` and `user.updated` events, calls `syncFromWebhook` internalMutation to keep Convex in sync.
- **`convex/users.ts`** — Added `listAll` query (league_admin only, returns all users) and `syncFromWebhook` internalMutation. Updated `upsertUser` to patch existing records (not just insert) so Clerk data stays current in Convex.
- **`proxy.ts`** — Added `/admin/*` route guard. Redirects non-`league_admin` users to `/user`.
- **`convex/schema.ts`** — Added `email` and `role` fields to the `users` table.
- **`lib/roles.ts`** — Single source of truth for `AppRole` type and role config (label, description, permissions list).
- **`convex/migrations.ts`** — Temporary. `setRole` internalMutation used to manually seed the DB role while webhook is not yet registered.

### Bugs fixed during this branch

- **Intermittent "Unauthorized" on `/admin/users`** (1-in-5 load rate): `listAll` was throwing when `getUserIdentity()` returned null during the Convex auth token initialization race. Fixed by returning `null` instead of throwing — Convex re-runs the query when the token arrives.
- **Admin table showing no user data**: `upsertUser` was returning early on existing records without updating fields. Fixed to always patch `firstName`/`lastName`/`email`. Effect in `app/user/page.tsx` now runs on every login (not just when `profile === null`).
- **Debug route breaking production build**: A top-level `throw` in `app/api/debug/user-tokens/route.ts` was evaluated at build time by Turbopack. Route was removed entirely.

### Known issue / pending

- **Clerk webhook not yet registered**. `convex/http.ts` is implemented and deployed to Convex, but the Clerk Dashboard webhook endpoint has not been created yet. Until it is:
  - Role changes in the admin UI write to Clerk immediately but only sync to Convex DB after the user visits `/user` (triggering `upsertUser`).
  - New users won't have their Convex records created until they visit `/user`.
  - `convex/migrations.ts` (temporary) was used to manually seed the DB role for the developer's own account.

**To complete this branch**:
1. Register webhook in Clerk Dashboard (see `MEMORY.md` → Pending Work)
2. Add `CLERK_WEBHOOK_SECRET` to `.env.local` and Vercel
3. Delete `convex/migrations.ts`
4. Delete `adminrolemanagement.patch` from project root
5. Merge to `main`

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
