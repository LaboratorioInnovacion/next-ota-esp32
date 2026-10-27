import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateMeasurement } from '../../../my-app/lib/measurement.mjs';
import { measurementPost } from '../../../my-app/lib/measurement-http.mjs';

test('native identity/location policy payloads reach real Next.js handler with mocked persistence', async () => {
  const cache = join(homedir(), '.cache/opencode/tmp/opencode');
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(join(cache, 'station-contract-'));
  try {
    const binary = join(directory, 'fixture');
    execFileSync(process.env.CXX || 'g++', ['-std=c++11', '-Wall', '-Wextra', '-Werror', '-pedantic',
      fileURLToPath(new URL('./station_payload_fixture.cpp', import.meta.url)), '-o', binary]);
    const payloads = execFileSync(binary, { encoding: 'utf8' }).trim().split('\n').map(JSON.parse);
    assert.deepEqual(payloads.map(({ mac, lat, lon }) => [mac, lat, lon]), [
      ['02:00:00:00:00:01', 12.5, -45.25], ['02:00:00:00:00:02', 0, 0],
      ['02:00:00:00:00:02', 12.5, -45.25], ['02:00:00:00:00:01', 12.5, -45.25],
    ]);
    assert.deepEqual(payloads.map(({ name }) => name), [
      'Synthetic station', 'Estación "Norte" \\ patio', 'Synthetic station', 'Synthetic station',
    ]);
    const stations = new Map();
    const readings = [];
    const persistence = { $transaction: async callback => callback({
      station: { upsert: async ({ where, create, update }) => {
        const previous = stations.get(where.mac);
        const station = previous ? { ...previous, ...update } : { id: where.mac, ...create };
        stations.set(where.mac, station);
        return station;
      } },
      reading: { create: async ({ data }) => { readings.push(data); return data; } },
    }) };
    const post = measurementPost(persistence, 'esp32', () => 'synthetic-test-token');
    for (const [index, payload] of payloads.entries()) {
      assert.equal(Object.hasOwn(validateMeasurement(payload), 'version'), false);
      const response = await post(new Request('https://example.invalid/api/esp32', {
        method: 'POST', body: JSON.stringify(payload),
        headers: { Authorization: 'Bearer synthetic-test-token' },
      }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).station.mac, payload.mac);
      assert.equal(stations.get(payload.mac).latitude, payload.lat);
      assert.equal(stations.get(payload.mac).longitude, payload.lon);
      assert.equal(stations.get(payload.mac).name, payload.name);
      assert.equal(readings[index].stationId, stations.get(payload.mac).id);
    }
    assert.equal(stations.size, 2);
    assert.equal(readings.length, 4);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
