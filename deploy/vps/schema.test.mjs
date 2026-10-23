import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("Current Prisma source matches the existing one-time VPS bootstrap SQL offline", () => {
  const cwd = fileURLToPath(new URL("../../my-app/", import.meta.url));
  const result = spawnSync("./node_modules/.bin/prisma", [
    "migrate", "diff", "--config", "prisma/vps.config.ts", "--from-empty",
    "--to-schema", "prisma/schema.prisma", "--script",
  ], {
    cwd,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: "postgresql://build:build@127.0.0.1:1/build" },
    encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, "Offline SQL generation must succeed without a DB");
  // SQL statement and table-column order do not change the relational schema.
  const canonical = (sql) => sql.replace(/--[^\n]*/g, "").split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter((statement) => statement && !statement.startsWith("CREATE SCHEMA"))
    .map((statement) => statement.replace(/^(CREATE TABLE "\w+" \()(.*)(\))$/, (_, start, body, end) =>
      start + body.split(",").map((part) => part.trim()).sort().join(",") + end))
    .sort();
  const bootstrap = readFileSync(new URL("../db-bootstrap/schema.sql", import.meta.url), "utf8");
  assert.equal((result.stdout.match(/CREATE TABLE /g) || []).length, 3);
  assert.deepEqual(canonical(bootstrap), canonical(result.stdout));
});
