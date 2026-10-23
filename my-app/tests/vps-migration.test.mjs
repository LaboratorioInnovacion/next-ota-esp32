import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("VPS bootstrap migration matches the pre-diagnostics PostgreSQL schema without connecting", () => {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const result = spawnSync("./node_modules/.bin/prisma", [
    "migrate", "diff", "--config", "prisma/vps.config.ts", "--from-empty",
    "--to-schema", "tests/fixtures/pre-diagnostics.prisma", "--script",
  ], {
    cwd,
    env: { ...process.env, DATABASE_URL: "postgresql://build:build@127.0.0.1:1/build" },
    encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, "Read-only Prisma diff must succeed");
  assert.ok(result.stdout.includes('CREATE TABLE "Station"'), "Diff must not silently return empty output");
  const normalize = (sql) => sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
  const migration = readFileSync(new URL("../prisma/migrations/20261023000000_vps_init/migration.sql", import.meta.url), "utf8");
  assert.equal(normalize(migration), normalize(result.stdout));
});

test("additive diagnostics migration matches the schema delta without connecting", () => {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const result = spawnSync("./node_modules/.bin/prisma", [
    "migrate", "diff", "--config", "prisma/vps.config.ts",
    "--from-schema", "tests/fixtures/pre-diagnostics.prisma",
    "--to-schema", "prisma/schema.prisma", "--script",
  ], {
    cwd,
    env: { ...process.env, DATABASE_URL: "postgresql://build:build@127.0.0.1:1/build" },
    encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, "Read-only Prisma diff must succeed");
  const normalize = (sql) => sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
  const migration = readFileSync(new URL("../prisma/migrations/20261023010000_diagnostics/migration.sql", import.meta.url), "utf8");
  assert.equal(normalize(migration), normalize(result.stdout));
});
