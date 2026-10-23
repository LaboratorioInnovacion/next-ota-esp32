import { defineConfig, env } from "prisma/config";

// Explicit VPS-only configuration; never load the existing application .env.
export default defineConfig({
  schema: "./schema.prisma",
  migrations: { path: "./migrations" },
  datasource: { url: env("DATABASE_URL") },
});
