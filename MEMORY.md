# Memory file for Current Agent working on this project

---

## What This Project Is

**A.R.L.O.** — Automated Referee & League Operations. A sports league management platform built for a lacrosse organization. This repo is the **user portal** (Project 1: Family & Player Registration). Future projects will add referee scheduling, program administration, etc.

The developer codes primarily with LLM agents. Treat all existing code as potentially bloated — delete freely, keep things minimal and typed.

---

## Non-Negotiable Developer Rules

Read `AGENTS.md` every session. The two rules that will get you in trouble if you forget:

1. **TypeScript only. Always strict. Zero `any`.** The developer will call this out hard. Every type must be defined. If you see a `.js` file or an untyped `any`, flag it and fix it.
2. **Delete unused code without asking.** Packages, files, functions, dead imports — if it's not used, remove it.

Package manager is **Bun**, not npm or yarn. Use `bun add`, `bunx`, `bun run`.

---

## Tech Stack (exact versions — verify in package.json before assuming)

| Layer | Package | Version | Notes |
|---|---|---|---|
| Framework | `next` | 16.2.9 | Turbopack; breaking changes from prior versions |
| Auth | `@clerk/nextjs` | 7.5.11 | Core 3 API |
| Backend/DB | `convex` | 1.42.1 | Real-time serverless |
| UI components | `shadcn/ui` | — | `@base-ui/react` variant, not Radix |
| Styling | Tailwind CSS | v4 | `@import "tailwindcss"` syntax |
| Hosting | Vercel | — | Main branch deploys automatically |
| Runtime | Bun | — | Always use bun/bunx |

---

## Next.js 16 Breaking Changes (critical — differs from training data)

Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/`.

- **`proxy.ts` not `middleware.ts`** — Clerk middleware lives at `proxy.ts` in the root.
- **`params` and `searchParams` are Promises** — must `await` them in page/layout components.
- **`SignedIn`/`SignedOut` not exported** from `@clerk/nextjs` — use the `Show` component: `<Show when="signed-in">`, `<Show when="signed-out">`.
- **shadcn `Button` has no `asChild` prop** (uses `@base-ui/react`) — use `buttonVariants` with `Link` instead: `<Link className={cn(buttonVariants({ variant: "outline" }))}>`.

---

## Clerk Setup (critical details)

**Two separate tokens** — do not confuse them:

| Token | Where configured | What reads it |
|---|---|---|
| Session token | Clerk Dashboard → Configure → **Sessions** → Customize session token | `auth()` in proxy.ts and server code (`sessionClaims`) |
| Convex JWT template | Clerk Dashboard → **JWT Templates** → "convex" | `ConvexProviderWithClerk` → Convex `getUserIdentity()` |

Both tokens must include `"metadata": "{{user.public_metadata}}"` for role checks to work. The developer had to add this to **both** locations — adding it to only one is a common mistake.

**Roles** are stored in Clerk `publicMetadata.role`. Valid values defined in `lib/roles.ts`:
```
"family" | "referee" | "program_admin" | "league_admin" | "super_admin"
```
`super_admin` is a strict superset of `league_admin` — every `role !== "league_admin"` check in the codebase must also allow `super_admin`, in ALL layers, not just route guards. This spans: `proxy.ts` (`/admin(.*)` gate), `app/dashboard/page.tsx` and `app/admin/page.tsx` (UI), the API routes `app/api/users/{role,delete,invite}/route.ts` (both the `callerRole` check AND `VALID_ROLES` validation arrays), and the Convex-side checks in `convex/users.ts`'s `listAll` and `convex/customTables.ts`'s `requireLeagueAdminQuery`/`requireLeagueAdminMutation` helpers. When `super_admin` was first added, only page-level gating was updated — `listAll` still threw `"Forbidden"` for a `super_admin` viewing `/admin`, since the Convex-side check was missed. `grep -rn '"league_admin"'` across the repo before considering a role-tier change done.

**Role update flow (existing user)**: `POST /api/users/role` (server route) → `clerkClient().users.updateUser()` → Clerk fires `user.updated` webhook → Convex HTTP action → `syncFromWebhook` internalMutation patches `users.role`.

**Role pre-assignment flow (new user via invite)**: `POST /api/users/invite` (server route) → `clerkClient().invitations.createInvitation({ emailAddress, publicMetadata: { role } })` → Clerk emails the invite → on acceptance/signup, Clerk automatically copies the invitation's `publicMetadata` onto the new `User.publicMetadata` → Clerk fires `user.created` (same webhook as above) → `syncFromWebhook` picks up `role` with zero extra Convex code. No admin follow-up needed after the invite is sent.

**Deletion flow**: `POST /api/users/delete` (server route, blocks self-deletion) → `clerkClient().users.deleteUser()` → Clerk fires `user.deleted` on the **same** webhook endpoint (`/clerk-webhook` — one endpoint subscribed to multiple event types, not a second webhook) → `deleteByClerkId` internalMutation removes the matching Convex `users` row.

Webhook is registered and live (`/clerk-webhook` on Convex), subscribed to `user.created`, `user.updated`, and `user.deleted`. Required `CLERK_WEBHOOK_SECRET` to be set both in `.env.local` **and** in the Convex dashboard's environment variables — missing it on the Convex side was why the webhook initially failed.

**Impersonation flow (`super_admin` only, single-session — no Clerk multi-session feature required)**:

- **Enter**: `POST /api/admin/impersonate` (`{ targetClerkId }`) → `clerkClient().actorTokens.create({ userId: targetClerkId, actor: { sub: callerId } })` (Clerk's native impersonation primitive — NOT a custom session swap) → route also writes an `impersonationEvents` row via `ConvexHttpClient` (forwarding the caller's Convex JWT so `convex/impersonation.ts`'s `logStart` mutation can independently re-verify `super_admin`) → route builds its own redemption URL, `new URL("/sign-in", request.url)` with `?__clerk_ticket=<actorToken.token>` appended, and returns `{ url }`. **Do not use `actorToken.url` directly** — `ActorTokenCreateParams` has no `redirectUrl` param (unlike the invitation API above), so `.url` defaults to Clerk's hosted Account Portal (`*.accounts.dev`), landing on the Account Portal's own `/default-redirect` instead of this app. Client-side, `app/admin/users/page.tsx`'s `confirmImpersonate` calls `await clerk.signOut()` **before** navigating to that URL — without this, Clerk silently ignores `__clerk_ticket` whenever a session is already active (this is the multi-session-vs-single-session distinction: redeeming a ticket while signed in requires Clerk's paid multi-session feature; signing out first works on any plan).
- **Detect**: the resulting session's JWT carries an `actor: { sub: adminClerkId }` claim, readable via `auth().actor` (server) or `useAuth().actor` (client). `components/impersonation-banner.tsx` renders whenever `actor` is present.
- **Exit**: `POST /api/admin/exit-impersonation` (no body) reads `auth().actor.sub` — the admin's real Clerk ID, cryptographically embedded in the current (impersonated) session's JWT, not client-supplied, so this route needs no separate role check — and calls `clerkClient().signInTokens.createSignInToken({ userId: actor.sub, expiresInSeconds: 60 })` (a normal, non-impersonation sign-in ticket — NOT another actor token, since we want the admin back in their own account with no `actor` claim this time). Same redemption-URL-building pattern as above. Client (`components/impersonation-banner.tsx`) signs out of the impersonated session first, then navigates to the returned URL.

---

## Convex Setup

`convex/auth.config.ts` links to the Clerk JWT template named `"convex"`:
```ts
{ domain: "https://famous-pigeon-50.clerk.accounts.dev", applicationID: "convex" }
```

`ConvexProviderWithClerk` in `app/ConvexClientProvider.tsx` uses `useAuth` from `@clerk/nextjs` — calls `getToken({ template: "convex" })` internally.

**Custom JWT claims in `getUserIdentity()`**: `UserIdentity` has `[key: string]: JSONValue | undefined`. Access custom claims via `identity["metadata"] as { role?: string }` — do NOT use the double-cast `(identity as Record<string, unknown>).metadata` pattern, it's fragile.

**Critical Convex query pattern**: Return `null` (not `throw`) when `getUserIdentity()` returns null. Throwing leaves `useQuery` permanently errored. Returning null lets Convex re-run the query when the auth token arrives.

```ts
const identity = await ctx.auth.getUserIdentity();
if (!identity) return null; // NOT throw new Error("Unauthorized")
```

---

## Project Architecture

```
/
├── proxy.ts                    # Clerk middleware (Next.js 16 = proxy.ts not middleware.ts)
├── app/
│   ├── layout.tsx              # ClerkProvider > ConvexClientProvider > header > ImpersonationBanner
│   ├── ConvexClientProvider.tsx
│   ├── page.tsx                # / redirects to /dashboard
│   ├── dashboard/
│   │   └── page.tsx            # Post-login landing page for all roles — calls upsertUser on every login;
│   │                           # dynamic, role-specific content only (league_admin/super_admin get an
│   │                           # "Open Admin Dashboard" link card; family gets "My Players"; other roles
│   │                           # get a "coming soon" placeholder). No profile info/admin stats here.
│   ├── user/
│   │   ├── page.tsx            # Read-only Profile Details + Permissions ("My Profile" link in header)
│   │   └── edit/page.tsx       # Edit phone/DOB/address (Clerk owns name/email)
│   ├── admin/
│   │   ├── layout.tsx          # Left sidebar nav (Dashboard | Users | Invite | Data), mobile hamburger overlay
│   │   ├── page.tsx            # /admin — League Overview widget + "Manage Users"/"Invite Users" quick links
│   │   ├── users/page.tsx      # /admin/users — Role management, Delete, Impersonate (super_admin only), DataTable
│   │   ├── invite/page.tsx     # /admin/invite — Send a Clerk email invite with a pre-assigned role
│   │   └── data/                # /admin/data — league_admin-defined custom data tables (sandbox, not type-safe)
│   │       ├── page.tsx        # List of tables + "New Table" builder dialog
│   │       └── [tableId]/page.tsx # Column editor + record CRUD grid for one custom table
│   ├── players/
│   │   ├── page.tsx            # /players — family's player list (cards), Add/Edit/Delete
│   │   ├── new/page.tsx        # /players/new — create-player form
│   │   └── [playerId]/edit/page.tsx  # /players/[playerId]/edit — edit-player form
│   └── api/
│       ├── users/role/route.ts       # Server route: update Clerk publicMetadata.role
│       ├── users/invite/route.ts     # Server route: create a Clerk invitation with publicMetadata.role preset
│       ├── users/delete/route.ts     # Server route: delete a Clerk user (blocks self-deletion)
│       ├── admin/impersonate/route.ts       # Server route: super_admin-only, creates a Clerk actor token
│       └── admin/exit-impersonation/route.ts # Server route: creates a normal sign-in ticket back to auth().actor.sub
├── components/
│   ├── impersonation-banner.tsx # "Viewing as X" banner + exit flow, shown whenever useAuth().actor is set
│   ├── address-autocomplete.tsx # Google Places autocomplete for the Street field on /user/edit
│   ├── ui/data-table.tsx       # Generic responsive table: desktop <table> + mobile card-per-row view
│   └── players/
│       └── player-form.tsx     # Shared create/edit player form (mode: "create" | "edit")
├── convex/
│   ├── schema.ts               # users, players, tableDefinitions, customRecords, impersonationEvents
│   ├── users.ts                # getCurrentUser, upsertUser, updateProfile, listAll, syncFromWebhook, deleteByClerkId
│   ├── players.ts              # listMyPlayers, createPlayer, updatePlayer, deletePlayer (guardian-scoped)
│   ├── customTables.ts         # league_admin-only CRUD for admin-defined tables/columns/records (v.any() confined here)
│   ├── impersonation.ts        # logStart — super_admin-only audit-write mutation, called via ConvexHttpClient
│   ├── http.ts                 # Clerk webhook handler at /clerk-webhook
│   └── auth.config.ts          # Links to Clerk JWT template "convex"
└── lib/
    └── roles.ts                # AppRole type, getRoleConfig(), DASHBOARD_PLACEHOLDERS
```

---

## Data Ownership

| Field | Owner | Notes |
|---|---|---|
| firstName, lastName | Clerk | Read via `useUser()` / `currentUser()` |
| email | Clerk | Read via `useUser()` / `currentUser()` |
| password | Clerk | Never touch |
| role | Clerk `publicMetadata.role` | Cached/denormalized in Convex `users.role` — **`users.role` is the canonical read source in the app** (e.g. `/dashboard`, `/user`); Clerk's client-side `publicMetadata.role` can lag a fresh admin role change until the session JWT refreshes |
| phone, dateOfBirth, address | Convex | League-specific data, viewed on `/user`, edited via `/user/edit` |
| players (firstName, lastName, dateOfBirth, gender, school, grade) | Convex | Owned by the `family` guardian who created them (`guardianClerkId`); managed on `/players` |

Convex caches `firstName`, `lastName`, `email`, `role` from Clerk for admin queries. These are synced:
- On every `/dashboard` page load (`upsertUser` mutation patches the record)
- Via Clerk webhook on `user.created` / `user.updated` (when registered)

---

## Convex Schema (`convex/schema.ts`)

```ts
users: defineTable({
  clerkId: v.string(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  email: v.optional(v.string()),
  role: v.optional(v.string()),
  phone: v.optional(v.string()),
  dateOfBirth: v.optional(v.string()),
  address: v.optional(v.object({
    street: v.string(), city: v.string(), state: v.string(), zip: v.string(),
  })),
}).index("by_clerk_id", ["clerkId"])

players: defineTable({
  guardianClerkId: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  dateOfBirth: v.string(),
  gender: v.optional(v.string()),
  school: v.optional(v.string()),
  grade: v.optional(v.string()),
}).index("by_guardian", ["guardianClerkId"])

tableDefinitions: defineTable({
  name: v.string(),
  createdBy: v.string(), // clerkId
  columns: v.array(v.object({
    key: v.string(), label: v.string(),
    type: v.union(v.literal("text"), v.literal("number"), v.literal("date"), v.literal("boolean"), v.literal("select")),
    options: v.optional(v.array(v.string())),
  })),
}).index("by_name", ["name"])

customRecords: defineTable({
  tableId: v.id("tableDefinitions"),
  data: v.record(v.string(), v.any()), // columnKey -> value; the ONE deliberate v.any() exception in this app
}).index("by_table", ["tableId"])

impersonationEvents: defineTable({
  adminClerkId: v.string(),
  targetClerkId: v.string(),
  startedAt: v.number(),
}).index("by_admin", ["adminClerkId"]).index("by_target", ["targetClerkId"])
```

`players.guardianClerkId` mirrors the `users.clerkId` / `by_clerk_id` convention (a raw Clerk subject string, not a `users._id` reference) so a player profile survives even if the guardian's own `users` doc doesn't exist yet. No `programId`/`teamId`/`season` fields — Programs, Teams, and Game Scheduling are separate future projects that don't exist in this codebase yet.

**`v.any()` exception**: `customRecords.data` and its corresponding mutation args in `convex/customTables.ts` are the only place `v.any()` is used in this codebase. This is intentional — `/admin/data` lets `league_admin` define arbitrary table shapes at runtime, which Convex's compile-time schema can't express. Do not let this pattern spread elsewhere; every other table/query/mutation stays strictly typed.

---

## Route Guards

`proxy.ts` protects routes:
- All routes require auth (except `/sign-in`, `/sign-up`)
- `/admin/*` requires `sessionClaims.metadata.role` to be `"league_admin"` or `"super_admin"` — redirects to `/dashboard` otherwise
- `/api/admin/impersonate` is NOT covered by the `/admin(.*)` matcher (that only matches page routes under `/admin`, not `/api/admin/*`) — it enforces `super_admin`-only access itself, in-route

---

## Pitfalls and Fixes Encountered

| Problem | Root cause | Fix |
|---|---|---|
| `SignedIn`/`SignedOut` not exported | Clerk v7 removed them | Use `<Show when="signed-in/out">` |
| Button `asChild` missing | shadcn uses @base-ui/react | Use `buttonVariants` + `Link` |
| Schema validation failed after field removal | Existing docs had the old fields | 3-step: make optional → push → migrate → remove → push |
| `upsertUser` "Not authenticated" | `useEffect` fired before Convex had the auth token | Guard with `&& clerkUser` (now: always call when `clerkUser` is available) |
| `/admin/users` blocked despite having role | Session token didn't include `publicMetadata` by default | Add `"metadata": "{{user.public_metadata}}"` to Clerk Sessions → Customize session token |
| `listAll` "Unauthorized" on fast loads | Convex query threw before auth token arrived → stuck error state | Return `null` instead of throwing when `!identity` |
| Admin table empty (no names/emails) | `upsertUser` returned early on existing records without updating | Changed to always patch `firstName`/`lastName`/`email`; effect runs every login |
| Debug route breaks production build | Top-level `throw` evaluated at build time | Never use top-level throws for env guards; gate inside the handler |
| Clerk webhook returned 400/failed silently | `CLERK_WEBHOOK_SECRET` was only set in `.env.local`, not in Convex's own environment variables (Convex HTTP actions run in Convex's environment, not Next.js's) | Add the secret to the Convex dashboard env vars too |
| `convex/_generated/api.d.ts` out of sync after adding a new Convex module | Isolated agent worktrees for `feat/admin-custom-data`/`feat/player-registration` had no `.env.local`/Convex deploy credentials, so `bunx convex codegen` couldn't run there | In the main working directory (with real `.env.local`/`CONVEX_DEPLOYMENT`), `bunx convex codegen` works and pushes schema changes to the real dev deployment — prefer this over hand-editing the generated file when credentials are available |
| Invite emails linked to Clerk's hosted Account Portal (`*.accounts.dev/sign-up`) instead of our app | `createInvitation` was called without `redirectUrl`, so Clerk fell back to its default Account Portal domain | Pass `redirectUrl: new URL("/sign-up", request.url).toString()` — Clerk appends the invitation ticket, and `<SignUp />` on our `/sign-up` page handles ticket-based sign-up automatically |
| Impersonation redirected to Clerk's hosted Account Portal (`*.accounts.dev/default-redirect`) instead of `/dashboard` | `actorTokens.create()` has no `redirectUrl` param (unlike `createInvitation`), so `actorToken.url` defaults to the Account Portal | Ignore `actorToken.url`; build a same-app URL from the raw `actorToken.token` instead: `new URL("/sign-in", request.url)` + `?__clerk_ticket=<token>` |
| Recurring: isolated worktree agents branch off a stale ancestor instead of the actual `development` tip (has happened repeatedly — `feat/admin-custom-data`'s first attempt, one of `feat/ui-ux-fixes`'s four sub-tasks) | Each fresh worktree's initial checkout snapshot can predate recent merges; an agent that doesn't verify against `origin/development` before branching inherits the wrong base | **Before merging any worktree-agent branch**, run `git diff origin/development origin/<branch> --stat` and sanity-check the file count/deletions — a huge unexpected deletion count means the branch is based on something stale. Never trust an agent's self-report that it "reset onto the correct base"; verify the actual diff yourself. If wrong, extract just the genuinely new files/diffs and reapply them directly on the correct base rather than merging the branch |
| `super_admin` got "Forbidden" from `listAll` on `/admin` despite the role existing | Adding a new role tier only updated page-level gates (`proxy.ts`, dashboard pages); the actual Convex-side `league_admin`-only checks in `convex/users.ts`/`convex/customTables.ts` and the API routes' `VALID_ROLES` arrays were missed | `grep -rn '"league_admin"'` across the whole repo and update every match, not just route guards |
| Impersonation "succeeded" (redirected into the app) but the admin was still signed in as themselves, not the target | Clerk silently ignores a sign-in ticket (`__clerk_ticket`) when a session is already active — redeeming into a *different* session while one exists requires Clerk's paid multi-session feature | Call `clerk.signOut()` client-side before navigating to the ticket URL, both entering and exiting impersonation; exit uses a separate normal `signInTokens.createSignInToken()` ticket (not another actor token) for `auth().actor.sub` to get back into the admin's own account — no multi-session needed either way |

---

## Environment Variables

Never commit `.env*` files. Required variables:

**`.env.local`** (local dev):
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
- `CLERK_WEBHOOK_SECRET` (add when webhook is registered)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (for address autocomplete on `/user/edit` — see `components/address-autocomplete.tsx`; requires a Google Cloud project with the Places API enabled, an API key restricted to this app's HTTP referrers, and billing enabled on the project even for free-tier usage. Optional at runtime — the address field degrades to a plain text input with no suggestions if unset, no crash.)

Same vars needed in Vercel environment variables (except `CONVEX_DEPLOYMENT` is replaced by Convex's Vercel integration).

---

## Pending Work

All items from the original `feat/admin-role-management` list are complete: the Clerk webhook is registered and live, `CLERK_WEBHOOK_SECRET` is set in both `.env.local` and the Convex dashboard, `convex/migrations.ts` has been deleted, and `adminrolemanagement.patch` was already removed.

`user.deleted` has been enabled on the existing `/clerk-webhook` subscription and end-to-end deletion (Clerk account removed → Convex `users` row removed via `deleteByClerkId`) has been confirmed working. No outstanding manual steps.

`feat/player-registration` added `family`-role player profile CRUD (`/players`, `/players/new`, `/players/[playerId]/edit`, `convex/players.ts`). Still needs manual browser testing (no real Clerk session available in the branch's dev environment): add a player, refresh to confirm persistence, edit, delete, and confirm a second family account can't see/edit the first family's players. The worktree that built it had no Convex deployment credentials, so `convex/_generated/api.d.ts` was hand-edited to declare the `players` module rather than regenerated via `convex dev` — run `bunx convex dev` once to have Convex regenerate it for real.
