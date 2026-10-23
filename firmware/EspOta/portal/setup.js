'use strict';
const form = document.getElementById('setup-form');
const ssid = document.getElementById('ssid');
const password = document.getElementById('password');
const latitude = document.getElementById('latitude');
const longitude = document.getElementById('longitude');
const photo = document.getElementById('qr-photo');
const status = document.getElementById('qr-status');
const reveal = document.getElementById('reveal');
reveal.hidden = false;
reveal.addEventListener('click', () => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  reveal.setAttribute('aria-pressed', String(visible));
  reveal.textContent = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
});
form.addEventListener('submit', event => {
  const decimal = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/;
  const validCoordinate = (text, limit) => text.length <= 24 && decimal.test(text) &&
    Number.isFinite(Number(text)) && Math.abs(Number(text)) <= limit;
  if ((latitude.value !== '' || longitude.value !== '') &&
      (!validCoordinate(latitude.value, 90) || !validCoordinate(longitude.value, 180))) {
    event.preventDefault();
    document.getElementById('form-status').textContent = 'Ingrese ambas coordenadas válidas con punto decimal, o deje ambas vacías para conservar la ubicación.';
    return;
  }
  if (new TextEncoder().encode(ssid.value).length > 32 ||
      /[\u0000-\u001f\u007f]/u.test(ssid.value) || !/^[\x20-\x7e]{8,63}$/.test(password.value)) {
    event.preventDefault();
    document.getElementById('form-status').textContent = 'Revise el nombre (hasta 32 bytes) y la contraseña WPA (8–63 caracteres ASCII imprimibles).';
    return;
  }
  document.getElementById('submit').disabled = true;
  photo.disabled = true;
  document.getElementById('form-status').textContent = 'Enviando para probar la conexión…';
});
// File selection works over local HTTP; no live-camera permissions are requested.
if (typeof jsQR === 'function' && typeof createImageBitmap === 'function' && typeof TextDecoder === 'function') {
  document.getElementById('qr-section').hidden = false;
} else {
  document.getElementById('qr-section').hidden = false;
  photo.disabled = true;
  status.textContent = 'La lectura de fotos no está disponible en este navegador. Complete los datos manualmente.';
}
photo.addEventListener('change', async () => {
  const file = photo.files[0];
  if (!file) return;
  let image;
  const canvas = document.createElement('canvas');
  photo.disabled = true;
  status.className = '';
  status.textContent = 'Leyendo la imagen en este teléfono…';
  try {
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      throw new Error('Elija una foto de hasta 8 MB, con un solo QR WiFi.');
    }
    const dimensions = imageDimensions(new Uint8Array(await file.arrayBuffer()));
    const scale = Math.min(1, 1024 / Math.max(dimensions.width, dimensions.height));
    // Bound both decode dimensions, including very tall or wide hostile images.
    image = await createImageBitmap(file, {
      resizeWidth: Math.max(1, Math.round(dimensions.width * scale)),
      resizeHeight: Math.max(1, Math.round(dimensions.height * scale)), resizeQuality: 'high'
    });
    if (!image.width || !image.height || image.width > 1024 || image.height > 1024) {
      throw new Error('Imagen demasiado alta o formato no compatible. Recorte el QR y reintente.');
    }
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    let found = null;
    // Mask the first QR and search again; do not silently choose among QRs.
    for (let attempt = 0; attempt < 2; attempt++) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (!code) break;
      if (found) throw new Error('Hay varios QR. Recorte la foto para incluir solo el QR WiFi.');
      found = code;
      const corners = ['topLeftCorner', 'topRightCorner', 'bottomRightCorner', 'bottomLeftCorner'].map(k => code.location[k]);
      ctx.fillStyle = 'white'; ctx.beginPath();
      corners.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath(); ctx.fill();
    }
    if (!found) throw new Error('No se encontró un QR. Acerque o recorte la imagen, o ingrese los datos manualmente.');
    const network = parseQRBytes(found.binaryData);
    ssid.value = network.ssid; password.value = network.password;
    password.type = 'password'; reveal.setAttribute('aria-pressed', 'false'); reveal.textContent = 'Mostrar contraseña';
    status.textContent = 'QR leído. Revise los datos y confirme cuando esté listo. Todavía no se envió nada.';
  } catch (error) {
    status.className = 'error';
    // Do not echo decoder/browser errors that could contain QR data.
    status.textContent = error instanceof Error && /^(QR WiFi|Elija|Imagen|Hay varios|No se encontró)/.test(error.message)
      ? error.message : 'No se pudo leer la foto en este navegador. Use JPEG/PNG o complete los datos manualmente.';
  } finally {
    if (image) image.close();
    canvas.width = canvas.height = 0;
    photo.value = ''; photo.disabled = false;
  }
});
