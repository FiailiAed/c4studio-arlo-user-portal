import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
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
});
