/* Shared by the offline portal and Node tests. Never submits credentials. */
(function (root) {
  'use strict';
  function parseWifiQR(text) {
    const fail = () => { throw new Error('QR WiFi inválido. Use una red WPA personal y revise los datos.'); };
    if (typeof text !== 'string' || text.length > 1024 || !text.startsWith('WIFI:') || !text.endsWith(';;')) fail();
    const fields = Object.create(null);
    let key = '', value = '', inValue = false;
    for (let i = 5; i < text.length - 1; i++) {
      let c = text[i];
      if (c === '\\') {
        c = text[++i];
        if (!inValue || !c || !'\\;:,'.includes(c)) fail();
        value += c;
      } else if (c === ';') {
        if (!inValue || !key || Object.prototype.hasOwnProperty.call(fields, key)) fail();
        fields[key] = value;
        key = ''; value = ''; inValue = false;
      } else if (c === ':' && !inValue) inValue = true;
      else if (inValue) value += c;
      else key += c;
    }
    if (key || value || inValue || Object.keys(fields).some(k => !['S', 'T', 'P', 'H'].includes(k))) fail();
    // Only standard WPA personal QR semantics; never infer Enterprise/WPA3 support.
    if (!['WPA', 'WPA2'].includes(fields.T) || (fields.H !== undefined && !['true', 'false'].includes(fields.H))) fail();
    const ssid = fields.S, password = fields.P;
    if (!ssid || typeof password !== 'string' || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(ssid) ||
        new TextEncoder().encode(ssid).length > 32 || !/^[\x20-\x7e]{8,63}$/.test(password)) fail();
    return { ssid, password };
  }
  root.parseWifiQR = parseWifiQR;
  function parseQRBytes(bytes) {
    if (!bytes || bytes.length > 1024) throw new Error('QR WiFi inválido. El contenido es demasiado largo.');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); }
    catch (_) { throw new Error('QR WiFi inválido. El texto debe usar UTF-8.'); }
    return parseWifiQR(text);
  }
  root.parseQRBytes = parseQRBytes;
  // Inspect bounded JPEG/PNG headers before asking the browser to decode pixels.
  function imageDimensions(bytes) {
    const fail = () => { throw new Error('Imagen no compatible o demasiado grande. Use JPEG/PNG de hasta 24 megapíxeles y recorte el QR.'); };
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let width = 0, height = 0;
    if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
        data.getUint32(12) === 0x49484452) {
      width = data.getUint32(16); height = data.getUint32(20);
    } else if (bytes[0] === 255 && bytes[1] === 216) {
      let offset = 2;
      while (offset + 4 <= bytes.length) {
        if (bytes[offset++] !== 255) fail();
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (offset + 2 > bytes.length) fail();
        const length = data.getUint16(offset);
        if (length < 2 || offset + length > bytes.length) fail();
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
          if (length < 8) fail();
          height = data.getUint16(offset + 3); width = data.getUint16(offset + 5); break;
        }
        if (marker === 218 || marker === 217) fail();
        offset += length;
      }
    }
    if (!width || !height || width > 8192 || height > 8192 || width * height > 24000000) fail();
    return { width, height };
  }
  root.imageDimensions = imageDimensions;
  if (typeof module !== 'undefined') module.exports = { parseWifiQR, parseQRBytes, imageDimensions };
})(typeof window === 'undefined' ? globalThis : window);
