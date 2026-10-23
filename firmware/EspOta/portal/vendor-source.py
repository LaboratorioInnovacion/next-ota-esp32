"""Vendor pinned official npm bytes; no installation or dependency execution."""
import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import urllib.request

root = Path(__file__).resolve().parent
url = 'https://registry.npmjs.org/jsqr/1.4.0'
metadata = json.load(urllib.request.urlopen(url))
archive = urllib.request.urlopen('https://registry.npmjs.org/jsqr/-/jsqr-1.4.0.tgz').read()
integrity = 'sha512-' + base64.b64encode(hashlib.sha512(archive).digest()).decode()
assert integrity == metadata['dist']['integrity']
assert hashlib.sha1(archive).hexdigest() == metadata['dist']['shasum']
with tarfile.open(fileobj=io.BytesIO(archive)) as package:
    source = package.extractfile('package/dist/jsQR.js').read()
    license_text = package.extractfile('package/LICENSE').read()
vendor = root / 'vendor'
vendor.mkdir(exist_ok=True)
(vendor / 'LICENSE.jsQR').write_bytes(license_text)
result = subprocess.run(['terser', '--compress', '--mangle'], input=source, capture_output=True, check=True)
output = b'/*! jsQR 1.4.0 | Apache-2.0 | see LICENSE.jsQR */\n' + result.stdout
(vendor / 'jsQR.min.js').write_bytes(output)
record = {
    'package': 'jsqr@1.4.0', 'metadata': url,
    'tarball': metadata['dist']['tarball'], 'integrity': integrity,
    'source_sha256': hashlib.sha256(source).hexdigest(),
    'asset_sha256': hashlib.sha256(output).hexdigest(),
    'asset_bytes': len(output), 'license': 'Apache-2.0',
    'minifier': subprocess.check_output(['terser', '--version'], text=True).strip(),
    'command': 'terser --compress --mangle',
}
(vendor / 'provenance.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2))
