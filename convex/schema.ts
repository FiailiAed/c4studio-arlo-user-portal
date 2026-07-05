import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    roles: v.optional(v.array(v.string())),
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

  players: defineTable({
    guardianClerkId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    dateOfBirth: v.string(),
    gender: v.optional(v.string()),
    school: v.optional(v.string()),
    grade: v.optional(v.string()),
  }).index("by_guardian", ["guardianClerkId"]),
  tableDefinitions: defineTable({
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
  }).index("by_name", ["name"]),

  customRecords: defineTable({
    tableId: v.id("tableDefinitions"),
    data: v.record(v.string(), v.any()), // columnKey -> value
  }).index("by_table", ["tableId"]),

  impersonationEvents: defineTable({
    adminClerkId: v.string(),
    targetClerkId: v.string(),
    startedAt: v.number(),
  }).index("by_admin", ["adminClerkId"]).index("by_target", ["targetClerkId"]),

  fields: defineTable({
    name: v.string(),
    location: v.optional(v.string()),
  }).index("by_name", ["name"]),

  teams: defineTable({
    name: v.string(),
    clubId: v.optional(v.id("clubs")),
  }).index("by_name", ["name"]).index("by_club", ["clubId"]),

  games: defineTable({
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
    .index("by_field_and_time", ["fieldId", "startTime"])
    .index("by_start_time", ["startTime"])
    .index("by_referee", ["refereeId"]),

  refereeProfiles: defineTable({
    clerkId: v.string(),
    stripeConnectId: v.optional(v.string()),
    transfersActive: v.optional(v.boolean()), // cached from stripe.accounts.retrieve, refreshed on page load
  }).index("by_clerk_id", ["clerkId"]),

  clubs: defineTable({
    name: v.string(),
    coachClerkId: v.optional(v.string()),
  }).index("by_coach", ["coachClerkId"]),

  rosters: defineTable({
    teamId: v.id("teams"),
    playerId: v.id("players"),
  }).index("by_team", ["teamId"]).index("by_player", ["playerId"]),

  leagueSettings: defineTable({
    refereePayRateCents: v.number(),
  }),

  payoutLedger: defineTable({
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
    .index("by_referee", ["refereeClerkId"]),

  disputes: defineTable({
    gameId: v.id("games"),
    raisedByClerkId: v.string(), // the coach who disputed
    reason: v.string(),
    status: v.union(v.literal("OPEN"), v.literal("RESOLVED")),
    resolutionNotes: v.optional(v.string()),
    resolvedByClerkId: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_game", ["gameId"])
    .index("by_status", ["status"]),

  documents: defineTable({
    title: v.string(),
    storageId: v.id("_storage"),
    category: v.optional(v.string()),
    requiredForRoles: v.array(v.string()),
    uploadedByClerkId: v.string(),
  }),

  documentAcknowledgments: defineTable({
    documentId: v.id("documents"),
    clerkId: v.string(),
    acknowledgedAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_user", ["clerkId"]),
});
