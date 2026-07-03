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
"family" | "referee" | "program_admin" | "league_admin"
```

**Role update flow**: `POST /api/users/role` (server route) → `clerkClient().users.updateUser()` → Clerk fires `user.updated` webhook → Convex HTTP action → `syncFromWebhook` internalMutation patches `users.role`.

Webhook is registered and live (`/clerk-webhook` on Convex). Required `CLERK_WEBHOOK_SECRET` to be set both in `.env.local` **and** in the Convex dashboard's environment variables — missing it on the Convex side was why the webhook initially failed.

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
│   ├── layout.tsx              # ClerkProvider > ConvexClientProvider > header
│   ├── ConvexClientProvider.tsx
│   ├── page.tsx                # / redirects to /dashboard
│   ├── dashboard/
│   │   ├── page.tsx            # Post-login landing page for all roles — calls upsertUser on every login,
│   │   │                       # shows shared profile/permissions + role-specific section (league_admin
│   │   │                       # gets a live user-count widget; other roles get a "coming soon" placeholder)
│   │   └── edit/page.tsx       # Edit phone/DOB/address (Clerk owns name/email)
│   ├── admin/
│   │   ├── loader/page.tsx     # Standalone ArloLoader screen (league_admin only)
│   │   └── users/page.tsx      # Role management table (league_admin only)
│   └── api/
│       └── users/role/route.ts # Server route: update Clerk publicMetadata.role
├── convex/
│   ├── schema.ts               # users table
│   ├── users.ts                # getCurrentUser, upsertUser, updateProfile, listAll, syncFromWebhook
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
| role | Clerk `publicMetadata.role` | Cached/denormalized in Convex `users.role` — **`users.role` is the canonical read source in the app** (e.g. `/dashboard`); Clerk's client-side `publicMetadata.role` can lag a fresh admin role change until the session JWT refreshes |
| phone, dateOfBirth, address | Convex | League-specific data, edited via `/dashboard/edit` |

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
```

---

## Route Guards

`proxy.ts` protects routes:
- All routes require auth (except `/sign-in`, `/sign-up`)
- `/admin/*` requires `sessionClaims.metadata.role === "league_admin"` — redirects to `/dashboard` otherwise

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

Same vars needed in Vercel environment variables (except `CONVEX_DEPLOYMENT` is replaced by Convex's Vercel integration).

---

## Pending Work

All items from the original list are complete: the Clerk webhook is registered and live, `CLERK_WEBHOOK_SECRET` is set in both `.env.local` and the Convex dashboard, `convex/migrations.ts` has been deleted, and `adminrolemanagement.patch` was already removed. Branch `feat/admin-role-management` is ready to merge to `main` pending final review.
