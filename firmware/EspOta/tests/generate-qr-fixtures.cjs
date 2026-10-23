// Uses the existing OS qrcode-terminal generator; never installs packages.
const QRCode = require('/usr/share/nodejs/qrcode-terminal/vendor/QRCode');
const fs = require('node:fs');
const path = require('node:path');
const payloads = ['WIFI:S:Fixture Router;T:WPA;P:test-only-pass;;',
  'WIFI:T:WPA2;S:Lab\\;Room\\:A\\,B\\\\C;P:fixture\\;pass\\\\word;;'];
const fixtures = payloads.map(payload => {
  const qr = new QRCode(-1, 1);
  qr.addData(payload); qr.make();
  return { payload, rows: qr.modules.map(row => row.map(Boolean).map(v => v ? '1' : '0').join('')) };
});
fs.writeFileSync(path.join(__dirname, 'qr-fixtures.json'), JSON.stringify(fixtures, null, 2) + '\n');
