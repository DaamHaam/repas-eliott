import { defineApp } from "convex/server";
import { v } from "convex/values";
export default defineApp({ env: { ADMIN_TOKEN_HASH: v.optional(v.string()) } });
