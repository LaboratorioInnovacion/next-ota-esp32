const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

test('generated flash contains exact manual form assets', () => {
  const header = fs.readFileSync(path.join(root, 'PortalAssets.h'), 'utf8');
  for (const file of ['setup.css', 'setup.js'])
    assert.ok(header.includes(fs.readFileSync(path.join(root, 'portal', file), 'utf8')));
  const html = fs.readFileSync(path.join(root, 'portal/setup.html'), 'utf8');
  for (const part of html.split(/\{\{(?:TOKEN|NAME)\}\}/)) assert.ok(header.includes(part));
  assert.match(html, /<form method="post" action="\/save"/);
  assert.match(html, /name="token" value="\{\{TOKEN\}\}"/);
  assert.match(html, /name="ssid"[^>]*required autocomplete="off"/);
  assert.match(html, /name="password" type="password"[^>]*required autocomplete="new-password"/);
});
test('portal has no QR image selector, decoder or upload path', () => {
  const html = fs.readFileSync(path.join(root, 'portal/setup.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'portal/setup.js'), 'utf8');
  const header = fs.readFileSync(path.join(root, 'PortalAssets.h'), 'utf8');
  assert.doesNotMatch(html, /type=["']file["']|capture=|multipart\/form-data|qr-/i);
  assert.deepEqual([...html.matchAll(/<script defer src="([^"]+)"/g)].map(match => match[1]), ['/setup.js']);
  assert.doesNotMatch(script, /jsQR|parseQRBytes|parseWifiQR|createImageBitmap|canvas|FormData|fetch\(|XMLHttpRequest/);
  assert.doesNotMatch(header, /qr-photo|wifi-qr\.js|qr-decoder\.js|jsQR|const char (?:Parser|Decoder)\[\]/);
});
function harness() {
  let submitted = 0;
  const elements = new Map();
  const ids = new Set(['setup-form', 'ssid', 'password', 'station-name', 'latitude', 'longitude', 'reveal', 'submit', 'form-status']);
  function element(id) {
    assert.ok(ids.has(id), `Unexpected DOM dependency: ${id}`);
    if (!elements.has(id)) elements.set(id, {
      value: '', type: id === 'password' ? 'password' : '', hidden: true, disabled: false,
      listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; },
      setAttribute(name, value) { this[name] = value; }, submit() { submitted++; },
      requestSubmit() { submitted++; }
    });
    return elements.get(id);
  }
  // No decoder, image, camera, networking or persistence globals are supplied.
  const sandbox = { document: { getElementById: element }, TextEncoder };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'portal/setup.js'), 'utf8'), sandbox);
  return { element, submitted: () => submitted };
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
  assert.ok(html.includes('Leave both fields blank to clear the saved location and use the firmware defaults.'));
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
test('manual submit without decoder globals preserves values and uses default POST with busy feedback', () => {
  const h = harness(); let prevented = false;
  h.element('ssid').value = ' Manual Router '; h.element('password').value = 'test-only-pass';
  assert.equal(h.element('submit').disabled, false);
  assert.equal(h.submitted(), 0);
  h.element('setup-form').listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false); assert.equal(h.element('submit').disabled, true);
  assert.equal(h.element('ssid').value, ' Manual Router ');
  assert.equal(h.element('password').value, 'test-only-pass');
  assert.equal(h.element('password').type, 'password');
  assert.ok(h.element('form-status').textContent.length > 0);
  assert.equal(h.submitted(), 0);
});
test('manual validation still rejects invalid WiFi credentials without decoder globals', () => {
  for (const [ssid, password] of [['é'.repeat(17), 'test-only-pass'], ['a\nb', 'test-only-pass'],
    ['Manual', 'short'], ['Manual', 'x'.repeat(64)], ['Manual', 'é'.repeat(8)]]) {
    const h = harness(); let prevented = false;
    h.element('ssid').value = ssid; h.element('password').value = password;
    h.element('setup-form').listeners.submit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(h.element('submit').disabled, false);
    assert.equal(h.submitted(), 0);
  }
});
test('password reveal is explicit and accessible', () => {
  const h = harness();
  assert.equal(h.element('reveal').hidden, false);
  h.element('reveal').listeners.click();
  assert.equal(h.element('password').type, 'text'); assert.equal(h.element('reveal')['aria-pressed'], 'true');
  h.element('reveal').listeners.click();
  assert.equal(h.element('password').type, 'password'); assert.equal(h.element('reveal')['aria-pressed'], 'false');
});
test('optional station name uses native form POST, preserves other fields and validates UTF-8 byte limits', () => {
  const html = fs.readFileSync(path.join(root, 'portal/setup.html'), 'utf8');
  assert.match(html, /id="station-name" name="name" value="\{\{NAME\}\}" maxlength="64"/);
  for (const [name, accepted] of [['', true], ['   ', true], [' Estación "Norte" \\ patio ', true],
    ['é'.repeat(32), true], ['é'.repeat(33), false], ['a\nb', false], ['a\u0085b', false]]) {
    const h = harness(); let prevented = false;
    h.element('ssid').value = 'Fixture'; h.element('password').value = 'test-only-pass';
    h.element('latitude').value = '0'; h.element('longitude').value = '0';
    h.element('station-name').value = name;
    h.element('setup-form').listeners.submit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, !accepted);
    assert.equal(h.element('station-name').value, name);
    assert.equal(h.element('ssid').value, 'Fixture');
    assert.equal(h.element('password').value, 'test-only-pass');
    assert.equal(h.element('latitude').value, '0');
    assert.equal(h.element('submit').disabled, accepted);
  }
});
