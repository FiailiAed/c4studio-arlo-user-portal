import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Pure Clerk-auth profile mirror. Roles/tenancy live entirely in
  // orgMemberships — this table intentionally has no `roles` field.
  users: defineTable({
    clerkId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.string(),
        city: v.string(),
        state: v.string(),
        zip: v.string(),
      })
    ),
  }).index("by_clerk_id", ["clerkId"]),

  // Tenant record. Convex-native — no Clerk Organization behind this at all.
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  // The single source of truth for who belongs to an org and what they can
  // do there. No Clerk mirror, no webhook, no eventual consistency: a role
  // change here is visible everywhere the instant the mutation commits.
  orgMemberships: defineTable({
    clerkId: v.string(),
    orgId: v.id("organizations"),
    roles: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("removed")),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_org", ["orgId"])
    .index("by_org_and_clerk_id", ["orgId", "clerkId"]),

  // Generic, arbitrary-depth, admin-defined org hierarchy. `unitType` is
  // free text (not an enum) so SJYLAX's League -> Township -> Program ->
  // Division -> Team shape, or any future client's different shape, is just
  // data, not a schema change.
  orgUnits: defineTable({
    orgId: v.id("organizations"),
    parentUnitId: v.optional(v.id("orgUnits")),
    unitType: v.string(),
    name: v.string(),
    order: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_parent", ["orgId", "parentUnitId"]),

  // Replaces Clerk's Organization Invitation feature. An admin creates one
  // of these (and we fire a plain Clerk account-invite email, not an org
  // invite); on signup/login we match by email and materialize the
  // orgMembership with the stored roles.
  orgInvitations: defineTable({
    orgId: v.id("organizations"),
    email: v.string(),
    roles: v.array(v.string()),
    invitedByClerkId: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked")),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_email_and_status", ["email", "status"]),

  players: defineTable({
    orgId: v.id("organizations"),
    guardianClerkId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    dateOfBirth: v.string(),
    gender: v.optional(v.string()),
    school: v.optional(v.string()),
    grade: v.optional(v.string()),
  })
    .index("by_guardian", ["guardianClerkId"])
    .index("by_org", ["orgId"])
    .index("by_org_and_guardian", ["orgId", "guardianClerkId"]),

  tableDefinitions: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    createdBy: v.string(), // clerkId
    columns: v.array(
      v.object({
        key: v.string(), // stable, server-generated, never changes
        label: v.string(), // freely editable display name
        type: v.union(
          v.literal("text"),
          v.literal("number"),
          v.literal("date"),
          v.literal("boolean"),
          v.literal("select")
        ),
        options: v.optional(v.array(v.string())), // "select" only
      })
    ),
  }).index("by_org", ["orgId"]),

  customRecords: defineTable({
    orgId: v.id("organizations"),
    tableId: v.id("tableDefinitions"),
    data: v.record(v.string(), v.any()), // columnKey -> value
  }).index("by_org_and_table", ["orgId", "tableId"]),

  // Global, deliberately not org-scoped: audit trail of a platform-level
  // super_admin capability, not tenant data.
  impersonationEvents: defineTable({
    adminClerkId: v.string(),
    targetClerkId: v.string(),
    startedAt: v.number(),
  })
    .index("by_admin", ["adminClerkId"])
    .index("by_target", ["targetClerkId"]),

  fields: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    location: v.optional(v.string()),
  }).index("by_org", ["orgId"]),

  teams: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    clubId: v.optional(v.id("clubs")),
    orgUnitId: v.optional(v.id("orgUnits")),
  })
    .index("by_club", ["clubId"])
    .index("by_org", ["orgId"]),

  games: defineTable({
    orgId: v.id("organizations"),
    homeTeamId: v.id("teams"),
    awayTeamId: v.id("teams"),
    fieldId: v.id("fields"),
    startTime: v.number(), // unix ms
    status: v.union(
      v.literal("SCHEDULED"),
      v.literal("PENDING_ASSIGNMENT"),
      v.literal("REF_ASSIGNED"),
      v.literal("COMPLETED_WITH_SCORE"),
      v.literal("DISPUTED"),
      v.literal("CANCELLED")
    ),
    createdBy: v.string(), // clerkId
    refereeId: v.optional(v.string()), // clerkId of assigned referee
    refereeAccepted: v.optional(v.boolean()),
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
    scoreVerified: v.optional(v.boolean()),
  })
    .index("by_referee", ["refereeId"])
    .index("by_org_and_start_time", ["orgId", "startTime"])
    .index("by_org_and_field_and_time", ["orgId", "fieldId", "startTime"]),

  // Deliberately global (not org-scoped): a referee's Stripe Connect
  // identity is person-level and may span multiple leagues/tenants. The
  // Clerk-orgs reference branch left an unused optional orgId here; we
  // don't carry that forward.
  refereeProfiles: defineTable({
    clerkId: v.string(),
    stripeConnectId: v.optional(v.string()),
    transfersActive: v.optional(v.boolean()), // cached from stripe.accounts.retrieve, refreshed on page load
  }).index("by_clerk_id", ["clerkId"]),

  clubs: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    coachClerkId: v.optional(v.string()),
    orgUnitId: v.optional(v.id("orgUnits")),
  })
    .index("by_coach", ["coachClerkId"])
    .index("by_org", ["orgId"]),

  rosters: defineTable({
    orgId: v.id("organizations"),
    teamId: v.id("teams"),
    playerId: v.id("players"),
  })
    .index("by_team", ["teamId"])
    .index("by_player", ["playerId"])
    .index("by_org_and_team", ["orgId", "teamId"]),

  leagueSettings: defineTable({
    orgId: v.id("organizations"),
    refereePayRateCents: v.number(),
  }).index("by_org", ["orgId"]),

  payoutLedger: defineTable({
    orgId: v.id("organizations"),
    gameId: v.id("games"),
    refereeClerkId: v.string(),
    grossAmountCents: v.number(),
    platformFeeCents: v.number(), // 1.5% of gross, kept by the platform (not transferred)
    netAmountCents: v.number(), // gross - fee, the amount actually transferred
    stripeTransferId: v.optional(v.string()),
    status: v.union(v.literal("PENDING"), v.literal("PAID"), v.literal("FAILED")),
    failureReason: v.optional(v.string()),
  })
    .index("by_game", ["gameId"])
    .index("by_org", ["orgId"])
    .index("by_org_and_referee", ["orgId", "refereeClerkId"])
    .index("by_org_and_game", ["orgId", "gameId"]),

  disputes: defineTable({
    orgId: v.id("organizations"),
    gameId: v.id("games"),
    raisedByClerkId: v.string(), // the coach who disputed
    reason: v.string(),
    status: v.union(v.literal("OPEN"), v.literal("RESOLVED")),
    resolutionNotes: v.optional(v.string()),
    resolvedByClerkId: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_game", ["gameId"])
    .index("by_org_and_status", ["orgId", "status"]),

  documents: defineTable({
    orgId: v.id("organizations"),
    title: v.string(),
    storageId: v.id("_storage"),
    category: v.optional(v.string()),
    requiredForRoles: v.array(v.string()),
    uploadedByClerkId: v.string(),
  }).index("by_org", ["orgId"]),

  documentAcknowledgments: defineTable({
    orgId: v.id("organizations"),
    documentId: v.id("documents"),
    clerkId: v.string(),
    acknowledgedAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_org_and_user", ["orgId", "clerkId"]),
});
