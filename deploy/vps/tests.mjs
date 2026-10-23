import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const env = {
  ...process.env, APP_IMAGE: `ghcr.io/laboratorioinnovacion/next-ota-esp32:${"a".repeat(40)}`,
  VPS_DB_ADMIN_PASSWORD: "a".repeat(64), VPS_APP_DB_PASSWORD: "b".repeat(64),
};
const result = spawnSync("docker", ["compose", "-f", "deploy/vps/compose.yml", "config", "--format", "json"], {
  cwd: root, env, encoding: "utf8", timeout: 15000,
});

test("Compose renders with synthetic credentials and only dedicated resources", () => {
  assert.equal(result.status, 0, "Docker Compose parser is required; no daemon or containers needed");
  const config = JSON.parse(result.stdout);
  assert.equal(config.name, "next-ota-esp32-vps");
  assert.deepEqual(Object.keys(config.services), ["app"]);
  assert.equal(config.services.app.ports[0].host_ip, "127.0.0.1");
  assert.equal(config.services.app.ports[0].published, "3030");
  assert.equal(config.volumes, undefined);
  assert.equal(config.services.app.depends_on, undefined);
  assert.equal(config.networks.database.external, true);
  assert.equal(config.networks.database.name, "next-ota-esp32-vps_database");
  for (const resource of Object.values(config.networks)) {
    assert.ok(resource.name.startsWith("next-ota-esp32-vps_"));
  }
  assert.ok(config.services.app.environment.DATABASE_URL.includes("next_ota_vps_app:"));
  assert.equal(config.services.app.environment.VPS_DB_ADMIN_PASSWORD, undefined);
  assert.ok(!JSON.stringify(config.services.app).includes("next_ota_vps_owner"));
});

test("Secrets stay out of Git and the dedicated image context", () => {
  const ignored = spawnSync("git", ["check-ignore", "deploy/vps/.env", "deploy/vps/.env.vps", "deploy/vps/.env.vps.backup"], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(ignored.status, 0);
  assert.equal(ignored.stdout.trim().split("\n").length, 3);
  const example = spawnSync("git", ["check-ignore", "deploy/vps/.env.vps.example"], { cwd: root });
  assert.equal(example.status, 1, "The secret-free example must remain trackable");
  const patterns = read("../../my-app/Dockerfile.vps.dockerignore").split("\n");
  for (const pattern of [".env", ".env.*", ".vercel", "node_modules"]) assert.ok(patterns.includes(pattern));
});

test("Only manual CI can reach the isolated deploy script", () => {
  const workflow = read("../../.github/workflows/vps-private.yml");
  assert.ok(workflow.includes("workflow_dispatch:"));
  assert.ok(!/^  (push|pull_request):/m.test(workflow));
  assert.ok(workflow.includes("default: false"));
  assert.ok(workflow.includes("VPS_PRIVATE_DEPLOY_ENABLED"));
  assert.ok(workflow.includes("StrictHostKeyChecking=yes"));
  assert.ok(!workflow.includes("VPS_ENV"));
  assert.ok(workflow.includes("deploy/vps/prepare-env.py"));
  assert.equal(existsSync(new URL("../../.github/workflows/deploy.yml", import.meta.url)), false);
  const archived = read("../../trash/deploy.yml");
  assert.ok(archived.startsWith("# Retired:"));
  assert.ok(archived.includes("name: CI/CD Next OTA ESP32"));
  const script = read("deploy-private.sh");
  assert.ok(workflow.includes("inputs.sha || github.sha"));
  assert.ok(workflow.includes('test "$REVISION" = "$WORKFLOW_SHA"'));
  assert.ok(workflow.includes("secrets.ESTACIONES_VPS_SSH_KEY"));
  assert.ok(!workflow.includes("deploy/vps/init-db.sh"));
  assert.ok(!/migrate|db push|db execute|compose (run|up[^\n]* db|pull[^\n]* db)/.test(script));
  assert.ok(script.includes("compose up -d --no-deps --wait --wait-timeout 180 app"));
  const dockerfile = read("../../my-app/Dockerfile.vps");
  const scripts = JSON.parse(read("../../my-app/package.json")).scripts;
  assert.equal(scripts.start, "next start");
  assert.ok(!/migrate deploy|db push|db execute/.test(dockerfile + JSON.stringify(scripts)));
  assert.ok(!/compose (down|stop|rm)|docker (system|volume) prune/.test(script));
  assert.ok(script.includes("-p next-ota-esp32-vps"));
});

test("The file-only bootstrap mount is accessible without opening release secrets", () => {
  const workflow = read("../../.github/workflows/vps-private.yml");
  const chmod = read("../db-bootstrap/bootstrap.sh").match(/chmod ([0-7]{3}) \.\.\/vps\/init-db\.sh/);
  assert.ok(chmod, "The remote command must set permissions on only init-db.sh");
  const accessibleToOtherUid = (mode) => (mode & 0o005) === 0o005;
  assert.equal(accessibleToOtherUid(0o700), false, "Regression: the previous root-owned mode denies postgres read/execute");
  assert.equal(accessibleToOtherUid(Number.parseInt(chmod[1], 8)), true);
  assert.equal(chmod[1], "755", "Only the nonsecret script may become publicly readable/executable");
  assert.ok(read("../db-bootstrap/compose.yml").includes("- ../vps/init-db.sh:/docker-entrypoint-initdb.d/10-app-role.sh:ro"));
  const bootstrap = read("init-db.sh");
  assert.ok(bootstrap.includes("\\getenv app_password VPS_APP_DB_PASSWORD"));
  assert.ok(!/PASSWORD\s+'(?!:)[^']+'/i.test(bootstrap), "No inline SQL password literals");

  const sandbox = mkdtempSync(join(tmpdir(), "ota-bootstrap-permissions-"));
  try {
    const bundle = join(sandbox, "bundle");
    mkdirSync(bundle, { mode: 0o700 });
    // Execute only the local credential-preparation portion with synthetic values.
    // Its existing EXIT trap removes all synthetic credential files afterward.
    const preparation = workflow.split("          set -euo pipefail\n")[1]
      .split("          options=(")[0].replace(/^          /gm, "");
    const prepared = spawnSync("bash", ["-c", `set -euo pipefail\n${preparation}
stat -c '%a' "$key" "$hosts" bundle/.docker bundle/.docker/config.json
`], {
      cwd: sandbox, encoding: "utf8", timeout: 10000,
      env: {
        ...process.env, RUNNER_TEMP: sandbox, REVISION: "a".repeat(40),
        VPS_HOST: "synthetic.invalid", VPS_USER: "synthetic",
        VPS_SSH_KEY: "synthetic-key", VPS_KNOWN_HOSTS: "synthetic-host",
        REGISTRY_USER: "synthetic", REGISTRY_TOKEN: "synthetic-token",
      },
    });
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.deepEqual(prepared.stdout.trim().split("\n"), ["600", "600", "700", "600"]);

    const source = join(bundle, "init-db.sh");
    // Never run the real SQL bootstrap: the fixture contains no psql or secrets.
    writeFileSync(source, "#!/bin/sh\nprintf 'synthetic-bootstrap-ok\\n'\n", { mode: 0o700 });
    const changed = spawnSync("chmod", [chmod[1], "init-db.sh"], { cwd: bundle });
    assert.equal(changed.status, 0);
    // A hard link models the same inode reached through the container's mount
    // path, not through private host release parents. No mounts or root needed.
    const containerInit = join(sandbox, "docker-entrypoint-initdb.d");
    mkdirSync(containerInit, { mode: 0o755 });
    chmodSync(containerInit, 0o755);
    const mounted = join(containerInit, "10-app-role.sh");
    linkSync(source, mounted);
    assert.equal(statSync(bundle).mode & 0o777, 0o700);
    assert.equal(statSync(source).ino, statSync(mounted).ino);
    assert.equal(statSync(mounted).mode & 0o777, 0o755);
    assert.equal(statSync(containerInit).mode & 0o777, 0o755);
    assert.ok(readFileSync(mounted, "utf8").includes("synthetic-bootstrap-ok"));
    const executed = spawnSync(mounted, [], { encoding: "utf8", timeout: 10000 });
    assert.equal(executed.status, 0, executed.stderr);
    assert.equal(executed.stdout, "synthetic-bootstrap-ok\n");
    // Runtime uses the current unprivileged UID, not postgres; the mode assertions
    // above cover access by another UID. This is not a real container/mount test.
    assert.notEqual(process.getuid(), 0, "Run this regression without elevated privileges");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

function fixture(run) {
  const sandbox = mkdtempSync(join(tmpdir(), "ota-env-lifecycle-"));
  try { run(sandbox); } finally { rmSync(sandbox, { recursive: true, force: true }); }
}

function prepare(sandbox) {
  return spawnSync("python3", [fileURLToPath(new URL("prepare-env.py", import.meta.url)), join(sandbox, "shared")], {
    cwd: sandbox, encoding: "utf8", timeout: 10000,
    env: { ...process.env, DATABASE_URL: "never-import-this", VPS_APP_DB_PASSWORD: "never-reuse-this" },
  });
}

test("One-time bootstrap atomically generates private credentials without reading project env", () => fixture((sandbox) => {
  const projectEnv = join(sandbox, ".env");
  writeFileSync(projectEnv, "DATABASE_URL=do-not-read-or-copy\n", { mode: 0o600 });
  const first = prepare(sandbox);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout + first.stderr, "");
  const shared = join(sandbox, "shared");
  const path = join(shared, ".env");
  const content = readFileSync(path, "utf8");
  const match = content.match(/^VPS_DB_ADMIN_PASSWORD=([0-9a-f]{64})\nVPS_APP_DB_PASSWORD=([0-9a-f]{64})\n$/);
  assert.ok(match);
  assert.notEqual(match[1], match[2]);
  assert.equal(statSync(shared).mode & 0o777, 0o700);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const inode = statSync(path).ino;
  const second = prepare(sandbox);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout + second.stderr, "");
  assert.equal(readFileSync(path, "utf8"), content);
  assert.equal(statSync(path).ino, inode, "Redeploy must not replace the file");
  assert.deepEqual(readdirSync(shared), [".env"]);
  assert.equal(readFileSync(projectEnv, "utf8"), "DATABASE_URL=do-not-read-or-copy\n");
}));

test("Missing, invalid, duplicate, equal, insecure and symlink envs fail closed without repair", () => {
  const valid = `VPS_DB_ADMIN_PASSWORD=${"a".repeat(64)}\nVPS_APP_DB_PASSWORD=${"b".repeat(64)}\n`;
  for (const state of ["missing", "partial", "duplicate", "equal", "file-mode", "directory-mode", "symlink"]) {
    fixture((sandbox) => {
      const shared = join(sandbox, "shared");
      mkdirSync(shared, { mode: 0o700 });
      const path = join(shared, ".env");
      if (state !== "missing") {
        let content = valid;
        if (state === "partial") content = "VPS_DB_ADMIN_PASSWORD=partial-secret\n";
        if (state === "duplicate") content += `VPS_APP_DB_PASSWORD=${"c".repeat(64)}\n`;
        if (state === "equal") content = valid.replaceAll("b", "a");
        writeFileSync(path, content, { mode: 0o600 });
        if (state === "file-mode") chmodSync(path, 0o644);
        if (state === "directory-mode") chmodSync(shared, 0o755);
        if (state === "symlink") {
          const original = join(sandbox, "original");
          writeFileSync(original, valid, { mode: 0o600 });
          rmSync(path);
          symlinkSync(original, path);
        }
      }
      const before = existsSync(path) ? readFileSync(path, "utf8") : null;
      const result = prepare(sandbox);
      assert.notEqual(result.status, 0, state);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Isolated credential preparation failed; inspect permissions/recovery state\n");
      assert.equal(existsSync(path) ? readFileSync(path, "utf8") : null, before, state);
      assert.deepEqual(readdirSync(shared), state === "missing" ? [] : [".env"]);
    });
  }
});

test("Mocked app-only deploy preserves credentials and fails closed without DB or bootstrap", () => {
  for (const scenario of ["healthy", "db-unhealthy", "missing-env", "missing-bootstrap", "inspect-fails", "pull-fails", "app-fails", "probe-fails"]) fixture((sandbox) => {
    const sha = "a".repeat(40);
    const release = join(sandbox, "releases", sha, "app");
    mkdirSync(release, { recursive: true });
    writeFileSync(join(release, "prepare-env.py"), read("prepare-env.py"));
    writeFileSync(join(release, "deploy-private.sh"), read("deploy-private.sh").replaceAll("/opt/next-ota-esp32-vps", sandbox));
    if (scenario !== "missing-env") {
      assert.equal(prepare(sandbox).status, 0);
    }
    if (scenario !== "missing-bootstrap") writeFileSync(join(sandbox, "bootstrap-completed-sha"), sha);
    mkdirSync(join(release, ".docker"));
    const bin = join(sandbox, "bin");
    mkdirSync(bin);
    const log = join(sandbox, "calls");
    writeFileSync(join(bin, "docker"), `#!/bin/sh
printf '%s\\n' "$*" >> "$CALL_LOG"
case "$*" in
  'volume inspect '*|'network inspect '*)
    [ "$SCENARIO" != inspect-fails ] || exit 19
    echo next-ota-esp32-vps ;;
  'ps -q '*) echo db-id ;;
  'inspect '*) [ "$SCENARIO" != db-unhealthy ] || { echo unhealthy; exit 0; }; echo healthy ;;
  *'pull app') [ "$SCENARIO" != pull-fails ] || exit 17 ;;
  *'up -d '*) [ "$SCENARIO" != app-fails ] || exit 18 ;;
esac
`, { mode: 0o755 });
    writeFileSync(join(bin, "curl"), '#!/bin/sh\n[ "$SCENARIO" != probe-fails ] || { printf 500; exit 0; }; printf 200\n', { mode: 0o755 });
    const deploy = () => spawnSync("sh", ["deploy-private.sh", sha], {
      cwd: release, encoding: "utf8", timeout: 10000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALL_LOG: log, SCENARIO: scenario },
    });
    const envPath = join(sandbox, "shared", ".env");
    const credentials = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;
    const first = deploy();
    assert.equal(first.status === 0, scenario === "healthy", first.stderr);
    const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
    assert.equal(calls.includes("--wait-timeout 180 app"), ["healthy", "app-fails", "probe-fails"].includes(scenario));
    assert.equal(existsSync(envPath), scenario !== "missing-env");
    assert.equal(existsSync(join(release, ".docker")), false);
    assert.doesNotMatch(calls, /migrate|db push|db execute|down|prune|up[^\n]* db|pull[^\n]* db/);
    assert.equal(existsSync(join(release, "deployed-sha")), scenario === "healthy");
    if (credentials !== null) {
      for (const line of credentials.trim().split("\n")) assert.ok(!(first.stdout + first.stderr + calls).includes(line.split("=")[1]));
      if (calls.includes("compose ")) assert.ok(calls.includes(`--env-file ${envPath}`));
      const second = deploy();
      assert.equal(second.status, first.status);
      assert.equal(readFileSync(envPath, "utf8"), credentials);
    }
  });
});
