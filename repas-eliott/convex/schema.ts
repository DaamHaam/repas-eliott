import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  categorySettings: defineTable({
    key: v.string(), title: v.string(), instruction: v.string(), places: v.number(),
  }).index("by_key", ["key"]),
  families: defineTable({
    tokenHash: v.string(), name: v.string(), guests: v.number(),
    comment: v.string(), active: v.boolean(), updatedAt: v.number(),
  }).index("by_tokenHash", ["tokenHash"]).index("by_active", ["active"]),
  slots: defineTable({
    category: v.string(), position: v.number(),
    familyId: v.union(v.id("families"), v.null()), dish: v.string(),
  }).index("by_category_and_position", ["category", "position"])
    .index("by_familyId", ["familyId"]),
});
