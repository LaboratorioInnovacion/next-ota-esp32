const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const { parseWifiQR, parseQRBytes, imageDimensions } = require('../portal/wifi-qr.js');
const jsQR = require('../portal/vendor/jsQR.min.js');
const fixtures = require('./qr-fixtures.json');
const valid = (ssid, password = 'test-only-pass', type = 'WPA') => `WIFI:S:${ssid};T:${type};P:${password};;`;

test('preserves spaces, case, escapes, delimiters and hidden flag', () => {
  assert.deepEqual(parseWifiQR('WIFI:T:WPA;S: A\\;B\\:C\\,D\\\\E ;P: test\\;pass ;H:true;;'),
    { ssid: ' A;B:C,D\\E ', password: ' test;pass ' });
});
test('byte limits allow UTF-8 SSID and printable ASCII passwords', () => {
  assert.equal(parseWifiQR(valid('é'.repeat(16))).ssid.length, 16);
  assert.equal(parseWifiQR(valid('😀'.repeat(8), ' '.repeat(8))).password.length, 8);
  assert.equal(parseWifiQR(valid('x', 'x'.repeat(63), 'WPA2')).password.length, 63);
});
test('raw QR bytes reject invalid UTF-8 and bound length before parsing', () => {
  assert.deepEqual(parseQRBytes(new TextEncoder().encode(valid('Fixture'))), { ssid: 'Fixture', password: 'test-only-pass' });
  assert.throws(() => parseQRBytes([0xc0, 0x80]));
  assert.throws(() => parseQRBytes(new Uint8Array(1025)));
});
const rejected = {
  'arbitrary URL': 'https://example.com/',
  'script payload': 'javascript:alert(1)',
  'wrong scheme': 'wifi:S:x;T:WPA;P:test-only-pass;;',
  'duplicate SSID': 'WIFI:S:a;S:b;T:WPA;P:test-only-pass;;',
  'duplicate auth': 'WIFI:S:a;T:WPA;T:WPA;P:test-only-pass;;',
  'unknown Enterprise field': 'WIFI:S:a;T:WPA;P:test-only-pass;E:TLS;;',
  'prototype key': 'WIFI:__proto__:x;S:a;T:WPA;P:test-only-pass;;',
  'truncated terminator': 'WIFI:S:a;T:WPA;P:test-only-pass;',
  'truncated escape': 'WIFI:S:a;T:WPA;P:test-only-pass\\;;',
  'invalid escape': 'WIFI:S:a\\q;T:WPA;P:test-only-pass;;',
  'missing auth': 'WIFI:S:a;P:test-only-pass;;',
  'open': 'WIFI:S:a;T:nopass;P:;;',
  'WEP': valid('a', 'test-only-pass', 'WEP'),
  'Enterprise': valid('a', 'test-only-pass', 'WPA2-EAP'),
  'WPA3 not guaranteed by selected core': valid('a', 'test-only-pass', 'WPA3'),
  'empty SSID': valid(''),
  'SSID byte overflow': valid('é'.repeat(17)),
  'invalid surrogate': valid('\ud800'),
  'control SSID': valid('a\nb'),
  'short password': valid('a', 'short'),
  'raw PSK': valid('a', 'a'.repeat(64)),
  'non-ASCII password': valid('a', 'é'.repeat(8)),
  'hidden flag injection': 'WIFI:S:a;T:WPA;P:test-only-pass;H:maybe;;',
  'payload overflow': valid('a'.repeat(1024)),
  'trailing content': valid('a') + 'https://example.com'
};
for (const [name, payload] of Object.entries(rejected)) {
  test(`rejects ${name} without echoing payload`, () => {
    assert.throws(() => parseWifiQR(payload), /^Error: QR WiFi inválido\./);
  });
}
function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.write('IHDR', 12); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return bytes;
}
test('bounds PNG/JPEG dimensions before pixel decoding', () => {
  assert.deepEqual(imageDimensions(pngHeader(4000, 3000)), { width: 4000, height: 3000 });
  const jpeg = Buffer.from([255, 216, 255, 192, 0, 8, 8, 0, 100, 0, 200, 0]);
  assert.deepEqual(imageDimensions(jpeg), { width: 200, height: 100 });
  for (const bytes of [pngHeader(100000, 1), pngHeader(8000, 8000), pngHeader(0, 10),
    Buffer.alloc(0), jpeg.subarray(0, 9), Buffer.from([255, 216, 255, 192, 0, 0])]) {
    assert.throws(() => imageDimensions(bytes));
  }
});
function pixels(fixture, inverted = false) {
  const scale = 5, side = (fixture.rows.length + 8) * scale;
  const rgba = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const row = fixture.rows[Math.floor(y / scale) - 4];
    const dark = row && row[Math.floor(x / scale) - 4] === '1';
    const color = Boolean(dark) !== inverted ? 0 : 255;
    const offset = (y * side + x) * 4;
    rgba.set([color, color, color, 255], offset);
  }
  return { rgba, side };
}
for (const [index, fixture] of fixtures.entries()) {
  test(`real vendored jsQR decodes synthetic fixture ${index + 1}, normal and inverted`, () => {
    for (const inverted of [false, true]) {
      const { rgba, side } = pixels(fixture, inverted);
      const result = jsQR(rgba, side, side, { inversionAttempts: 'attemptBoth' });
      assert.equal(result.data, fixture.payload);
      assert.ok(parseWifiQR(result.data).ssid);
      assert.ok(parseQRBytes(result.binaryData).ssid);
    }
  });
}
test('decoder returns null for blank image', () => {
  assert.equal(jsQR(new Uint8ClampedArray(128 * 128 * 4).fill(255), 128, 128), null);
});
test('vendored checksum matches provenance and generated flash contains exact assets', () => {
  const metadata = require('../portal/vendor/provenance.json');
  const decoder = fs.readFileSync(path.join(root, 'portal/vendor/jsQR.min.js'));
  assert.equal(crypto.createHash('sha256').update(decoder).digest('hex'), metadata.asset_sha256);
  const header = fs.readFileSync(path.join(root, 'PortalAssets.h'), 'utf8');
  for (const file of ['setup.css', 'setup.js', 'wifi-qr.js', 'vendor/jsQR.min.js'])
    assert.ok(header.includes(fs.readFileSync(path.join(root, 'portal', file), 'utf8')));
  const html = fs.readFileSync(path.join(root, 'portal/setup.html'), 'utf8');
  const [prefix, suffix] = html.split('{{TOKEN}}');
  assert.ok(header.includes(prefix) && header.includes(suffix));
  assert.match(html, /<form method="post" action="\/save"/);
  assert.match(html, /name="ssid"/); assert.match(html, /name="password" type="password"/);
});
function harness(codes = []) {
  let submitted = 0, calls = 0;
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', type: id === 'password' ? 'password' : '', hidden: true, disabled: false,
      listeners: {}, files: [], addEventListener(name, fn) { this.listeners[name] = fn; },
      setAttribute(name, value) { this[name] = value; }, submit() { submitted++; },
      requestSubmit() { submitted++; }
    });
    return elements.get(id);
  }
  const context2d = {
    drawImage() {}, getImageData() { return { data: new Uint8ClampedArray(16) }; },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}
  };
  const sandbox = {
    document: { getElementById: element, createElement() { return { getContext: () => context2d }; } },
    TextEncoder, TextDecoder, Uint8Array, Error, parseWifiQR, parseQRBytes, imageDimensions,
    jsQR() { calls++; return codes.shift() || null; },
    createImageBitmap: async () => ({ width: 100, height: 100, close() {} })
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'portal/setup.js'), 'utf8'), sandbox);
  return { element, submitted: () => submitted, calls: () => calls };
}
function code(data) {
  return { data, binaryData: new TextEncoder().encode(data), location: Object.fromEntries(['topLeftCorner', 'topRightCorner', 'bottomRightCorner', 'bottomLeftCorner'].map(k => [k, { x: 1, y: 1 }])) };
}
test('manual location accepts blank pair, zero and negative bounds without GPS', () => {
  for (const [latitude, longitude] of [['', ''], ['0', '0'], ['-90', '180'], ['90', '-180'], ['-34.5', '-58.25']]) {
    const h = harness();
    h.element('ssid').value = 'Fixture'; h.element('password').value = 'test-only-pass';
    h.element('latitude').value = latitude; h.element('longitude').value = longitude;
    let prevented = false;
    h.element('setup-form').listeners.submit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
    assert.equal(h.element('submit').disabled, true);
    assert.equal(h.submitted(), 0);
  }
  const html = fs.readFileSync(path.join(root, 'portal/setup.html'), 'utf8');
  assert.ok(html.includes('no solicita acceso al GPS'));
  assert.ok(!fs.readFileSync(path.join(root, 'portal/setup.js'), 'utf8').includes('geolocation'));
});
test('partial, nondecimal, nonfinite and out-of-range location never submits', () => {
  for (const [latitude, longitude] of [['1', ''], ['', '1'], ['90.001', '0'], ['0', '-180.001'],
    ['NaN', '0'], ['Infinity', '0'], ['0x10', '0'], ['1e1', '0'], ['1,2', '0'], [' ', ' ']]) {
    const h = harness();
    h.element('ssid').value = 'Fixture'; h.element('password').value = 'test-only-pass';
    h.element('latitude').value = latitude; h.element('longitude').value = longitude;
    let prevented = false;
    h.element('setup-form').listeners.submit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(h.element('submit').disabled, false);
    assert.equal(h.submitted(), 0);
  }
});
async function choose(h, size = 100) {
  const image = pngHeader(100, 100);
  const file = { type: 'image/png', size, arrayBuffer: async () => image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) };
  h.element('qr-photo').files = [file];
  await h.element('qr-photo').listeners.change();
}
test('QR autofills masked editable inputs and NEVER submits or saves', async () => {
  const h = harness([code(fixtures[0].payload)]);
  h.element('latitude').value = '-34.5'; h.element('longitude').value = '0';
  await choose(h);
  assert.equal(h.element('latitude').value, '-34.5'); assert.equal(h.element('longitude').value, '0');
  assert.equal(h.element('ssid').value, 'Fixture Router');
  assert.equal(h.element('password').value, 'test-only-pass');
  assert.equal(h.element('password').type, 'password');
  assert.equal(h.element('submit').disabled, false);
  assert.equal(h.submitted(), 0);
  h.element('ssid').value = 'Edited Router';
  assert.equal(h.element('ssid').value, 'Edited Router');
  assert.ok(!h.element('qr-status').textContent.includes('test-only-pass'));
});
test('multiple QR, invalid QR and oversized files preserve manual values', async () => {
  for (const codes of [[code(fixtures[0].payload), code(fixtures[1].payload)], [code('https://example.com')], []]) {
    const h = harness(codes); h.element('ssid').value = 'Manual';
    await choose(h); assert.equal(h.element('ssid').value, 'Manual');
    assert.equal(h.submitted(), 0); assert.equal(h.element('qr-photo').disabled, false);
  }
  const h = harness(); await choose(h, 9 * 1024 * 1024);
  assert.equal(h.calls(), 0);
});
test('manual submit uses default form POST only after validation and shows busy feedback', () => {
  const h = harness(); let prevented = false;
  h.element('ssid').value = 'Manual'; h.element('password').value = 'test-only-pass';
  h.element('setup-form').listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false); assert.equal(h.element('submit').disabled, true);
  assert.equal(h.submitted(), 0);
  const bad = harness(); bad.element('ssid').value = 'é'.repeat(17);
  bad.element('setup-form').listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});
test('password reveal is explicit and accessible', () => {
  const h = harness(); h.element('reveal').listeners.click();
  assert.equal(h.element('password').type, 'text'); assert.equal(h.element('reveal')['aria-pressed'], 'true');
  h.element('reveal').listeners.click(); assert.equal(h.element('password').type, 'password');
});
