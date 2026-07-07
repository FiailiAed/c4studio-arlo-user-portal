import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
    // Cached resolution of `address` to a US Census school sending-district —
    // one person, one address, one resolved district, not org-scoped.
    residency: v.optional(
      v.object({
        districtName: v.string(),
        county: v.optional(v.string()),
        resolvedAt: v.number(),
      })
    ),
  }).index("by_clerk_id", ["clerkId"]),

  // Multi-tenancy: one row per Clerk Organization. `clerkOrgId` is the
  // canonical join key stored as `orgId` on every tenant-scoped table below.
  organizations: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_clerk_org_id", ["clerkOrgId"]),

  // Per-org roles, replacing the old global `users.roles`. A user can hold
  // different (and multiple) AppRole values in each org they belong to.
  orgMemberships: defineTable({
    clerkId: v.string(),
    orgId: v.string(), // = organizations.clerkOrgId
    roles: v.array(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_org", ["orgId"])
    .index("by_org_and_clerk_id", ["orgId", "clerkId"]),

  // Generic, arbitrary-depth, admin-defined org hierarchy (e.g. SJYLAX's
  // League > Township > Program > Division > County > Team). `unitType` is a
  // free-text label the admin chooses, not a fixed enum, so any client's
  // hierarchy shape can be modeled as data. Not wired to clubs/teams yet.
  orgUnits: defineTable({
    orgId: v.string(),
    parentUnitId: v.optional(v.id("orgUnits")), // undefined = root node
    unitType: v.string(),
    name: v.string(),
    order: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_parent", ["orgId", "parentUnitId"]),

  players: defineTable({
    orgId: v.string(),
    guardianClerkId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    dateOfBirth: v.string(),
    gender: v.optional(v.string()),
    school: v.optional(v.string()),
    grade: v.optional(v.string()),
  }).index("by_guardian", ["guardianClerkId"]),
  tableDefinitions: defineTable({
    orgId: v.string(),
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
    orgId: v.string(),
    tableId: v.id("tableDefinitions"),
    data: v.record(v.string(), v.any()), // columnKey -> value
  }).index("by_org_and_table", ["orgId", "tableId"]),

  impersonationEvents: defineTable({
    orgId: v.optional(v.string()),
    adminClerkId: v.string(),
    targetClerkId: v.string(),
    startedAt: v.number(),
  }).index("by_admin", ["adminClerkId"]).index("by_target", ["targetClerkId"]),

  fields: defineTable({
    orgId: v.string(),
    name: v.string(),
    location: v.optional(v.string()),
  }).index("by_org", ["orgId"]),

  teams: defineTable({
    orgId: v.string(),
    name: v.string(),
    clubId: v.optional(v.id("clubs")),
    // Optional at the schema level (existing rows predate this field) —
    // createTeam requires it going forward; existing rows show "Unassigned"
    // until placed via assignTeamOrgUnit.
    orgUnitId: v.optional(v.id("orgUnits")),
  })
    .index("by_club", ["clubId"])
    .index("by_org", ["orgId"]),

  seasons: defineTable({
    orgId: v.string(),
    name: v.string(), // e.g. "Spring 2026"
    startDate: v.number(), // unix ms
    endDate: v.number(),
  }).index("by_org", ["orgId"]),

  games: defineTable({
    orgId: v.string(),
    // Optional at the schema level (existing rows predate this field) —
    // createGame requires it going forward; existing rows are backfilled
    // into one default season per org via a one-time migration.
    seasonId: v.optional(v.id("seasons")),
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
    .index("by_org_and_field_and_time", ["orgId", "fieldId", "startTime"])
    .index("by_org_and_season", ["orgId", "seasonId"]),

  refereeProfiles: defineTable({
    orgId: v.optional(v.string()),
    clerkId: v.string(),
    stripeConnectId: v.optional(v.string()),
    transfersActive: v.optional(v.boolean()), // cached from stripe.accounts.retrieve, refreshed on page load
  }).index("by_clerk_id", ["clerkId"]),

  clubs: defineTable({
    orgId: v.string(),
    name: v.string(),
    coachClerkId: v.optional(v.string()),
    // Same optional-forever pattern as teams.orgUnitId — createClub requires
    // it going forward, existing rows show "Unassigned" until placed.
    orgUnitId: v.optional(v.id("orgUnits")),
  })
    .index("by_coach", ["coachClerkId"])
    .index("by_org", ["orgId"]),

  rosters: defineTable({
    orgId: v.string(),
    teamId: v.id("teams"),
    playerId: v.id("players"),
    // Set only when a league_admin overrode a residency-district mismatch —
    // the audit trail for that escape hatch.
    residencyOverrideReason: v.optional(v.string()),
  })
    .index("by_team", ["teamId"])
    .index("by_player", ["playerId"])
    .index("by_org_and_team", ["orgId", "teamId"]),

  // Per-org mapping from a Census school-district name to the org unit that
  // covers it. `municipality` disambiguates regional districts that serve
  // multiple towns mapped to different clubs — a row with no municipality is
  // the default/direct mapping for that district.
  districtMappings: defineTable({
    orgId: v.string(),
    districtName: v.string(),
    municipality: v.optional(v.string()),
    orgUnitId: v.id("orgUnits"),
  }).index("by_org_and_district", ["orgId", "districtName"]),

  // Logs a resolved-but-unmapped district encounter so admins have something
  // concrete to review, rather than a silent one-off failure per family.
  unmappedDistrictReports: defineTable({
    orgId: v.string(),
    districtName: v.string(),
    county: v.optional(v.string()),
    clerkId: v.string(),
    reportedAt: v.number(),
  }).index("by_org_and_district", ["orgId", "districtName"]),

  leagueSettings: defineTable({
    orgId: v.string(),
    refereePayRateCents: v.number(),
  }).index("by_org", ["orgId"]),

  payoutLedger: defineTable({
    orgId: v.string(),
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
    orgId: v.string(),
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
    orgId: v.string(),
    title: v.string(),
    storageId: v.id("_storage"),
    category: v.optional(v.string()),
    requiredForRoles: v.array(v.string()),
    uploadedByClerkId: v.string(),
  }).index("by_org", ["orgId"]),

  documentAcknowledgments: defineTable({
    orgId: v.string(),
    documentId: v.id("documents"),
    clerkId: v.string(),
    acknowledgedAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_org_and_user", ["orgId", "clerkId"]),
});
