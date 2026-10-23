import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = name => readFileSync(join(here, name), 'utf8');
const root = fileURLToPath(new URL('../../', import.meta.url));

test('DB-only Compose renders without app image or published ports', () => {
  const result = spawnSync('docker', ['compose', '-f', join(here, 'compose.yml'), 'config', '--format', 'json'], {
    encoding: 'utf8', env: { ...process.env, VPS_DB_ADMIN_PASSWORD: 'a'.repeat(64), VPS_APP_DB_PASSWORD: 'b'.repeat(64) },
  });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(config.services), ['db']);
  assert.equal(config.services.db.ports, undefined);
  assert.equal(config.services.db.image, 'postgres:16-alpine');
  assert.equal(config.networks.database.internal, true);
  assert.equal(config.volumes.pgdata.external, undefined);
  assert.equal(config.volumes.pgdata.name, 'next-ota-esp32-vps_pgdata');
});

test('Manual immutable workflow cannot build, deploy an app or run routine migrations', () => {
  const workflow = read('../../.github/workflows/db-bootstrap.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^  (push|pull_request):/m);
  for (const required of ['environment: vps-private', '"$REVISION" = "$WORKFLOW_SHA"', 'StrictHostKeyChecking=yes', 'ESTACIONES_VPS_SSH_KEY']) {
    assert.ok(workflow.includes(required), required);
  }
  assert.doesNotMatch(workflow + read('bootstrap.sh'), /docker (build|run|stop|rm)|compose (down|run)|prisma|migrate deploy|deploy-private\.sh/);
  assert.equal(existsSync(join(root, '.github/workflows/deploy.yml')), false);
  assert.equal((read('schema.sql').match(/CREATE TABLE /g) || []).length, 3);
  assert.equal((read('schema.sql').match(/CREATE (?:UNIQUE )?INDEX /g) || []).length, 6);
  assert.equal((read('schema.sql').match(/ON DELETE CASCADE ON UPDATE CASCADE/g) || []).length, 2);
  assert.match(read('verify.sql'), /BEGIN READ ONLY;/);
  assert.match(read('verify.sql'), /rolbypassrls/);
});

test('Shell syntax and mock safety gates: fresh, existing, collision, daemon failure, lost credentials', () => {
  const syntax = spawnSync('sh', ['-n', join(here, 'bootstrap.sh')]);
  assert.equal(syntax.status, 0);
  for (const scenario of ['fresh', 'existing', 'collision', 'daemon-fails', 'lost-credentials']) {
    const sandbox = mkdtempSync(join(tmpdir(), 'estaciones-db-contract-'));
    try {
      const base = join(sandbox, 'project');
      const sha = 'a'.repeat(40);
      const release = join(base, 'releases', sha, 'deploy', 'db-bootstrap');
      const helpers = join(base, 'releases', sha, 'deploy', 'vps');
      const bin = join(sandbox, 'bin');
      for (const path of [release, helpers, bin]) mkdirSync(path, { recursive: true });
      writeFileSync(join(release, 'bootstrap.sh'), read('bootstrap.sh').replace('/opt/next-ota-esp32-vps', base));
      writeFileSync(join(release, 'schema.sql'), read('schema.sql'));
      writeFileSync(join(release, 'verify.sql'), read('verify.sql'));
      writeFileSync(join(helpers, 'init-db.sh'), read('../vps/init-db.sh'));
      writeFileSync(join(helpers, 'prepare-env.py'), read('../vps/prepare-env.py'));
      if (scenario === 'existing') {
        spawnSync('python3', [join(helpers, 'prepare-env.py'), join(base, 'shared')]);
        writeFileSync(join(base, 'bootstrap-completed-sha'), sha);
      }
      writeFileSync(join(bin, 'docker'), `#!/bin/sh
printf '%s\n' "$*" >> "$CALLS"
case "$*" in
  'volume ls '*)
    [ "$SCENARIO" != daemon-fails ] || exit 19
    case "$SCENARIO" in existing|lost-credentials) echo next-ota-esp32-vps_pgdata ;; esac ;;
  'network ls '*) [ "$SCENARIO" != collision ] || echo next-ota-esp32-vps_database ;;
  'volume inspect '*|'network inspect '*) echo next-ota-esp32-vps ;;
  'ps -aq '*) [ "$SCENARIO" != existing ] || echo db-id ;;
  'ps -a '*) echo 'unrelated unchanged image running' ;;
  'inspect '*) echo '{}' ;;
  'compose '*)
    case "$*" in
      *'ps -q db') echo db-id ;;
      *'ps --format '*) echo healthy ;;
      *'exec -T db '*) cat >/dev/null ;;
    esac ;;
esac
exit 0
`, { mode: 0o755 });
      const calls = join(sandbox, 'calls');
      const result = spawnSync('sh', ['bootstrap.sh', sha], {
        cwd: release, encoding: 'utf8', timeout: 10000,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: calls, SCENARIO: scenario },
      });
      const success = ['fresh', 'existing'].includes(scenario);
      assert.equal(result.status === 0, success, `${scenario}: ${result.stderr}`);
      const log = readFileSync(calls, 'utf8');
      assert.equal(log.includes('up -d --wait'), scenario === 'fresh', scenario);
      assert.equal(existsSync(join(base, 'shared', '.env')), success, scenario);
      assert.equal(existsSync(join(base, 'bootstrap-completed-sha')), success, scenario);
      assert.doesNotMatch(log, /down|prune|migrate/);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }
});
