'use strict';
const form = document.getElementById('setup-form');
const ssid = document.getElementById('ssid');
const password = document.getElementById('password');
const stationName = document.getElementById('station-name');
const sendInterval = document.getElementById('send-interval');
const latitude = document.getElementById('latitude');
const longitude = document.getElementById('longitude');
const reveal = document.getElementById('reveal');
reveal.hidden = false;
reveal.addEventListener('click', () => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  reveal.setAttribute('aria-pressed', String(visible));
  reveal.textContent = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
});
form.addEventListener('submit', event => {
  if (sendInterval.value !== '' && (!/^[0-9]+$/.test(sendInterval.value) ||
      !Number.isSafeInteger(Number(sendInterval.value)) || Number(sendInterval.value) < 60 ||
      Number(sendInterval.value) > 86400)) {
    event.preventDefault();
    document.getElementById('form-status').textContent = 'Enter an integer interval from 60 to 86400 seconds, or leave blank to use the firmware default.';
    return;
  }
  const name = stationName.value.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, '');
  if (new TextEncoder().encode(stationName.value).length > 64 || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
    event.preventDefault();
    document.getElementById('form-status').textContent = 'Revise el nombre de la estación: máximo 64 bytes UTF-8, sin caracteres de control.';
    return;
  }
  const decimal = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/;
  const validCoordinate = (text, limit) => text.length <= 24 && decimal.test(text) &&
    Number.isFinite(Number(text)) && Math.abs(Number(text)) <= limit;
  if ((latitude.value !== '' || longitude.value !== '') &&
      (!validCoordinate(latitude.value, 90) || !validCoordinate(longitude.value, 180))) {
    event.preventDefault();
    document.getElementById('form-status').textContent = 'Enter both valid coordinates using a decimal point, or leave both blank to use the firmware defaults.';
    return;
  }
  if (new TextEncoder().encode(ssid.value).length > 32 ||
      /[\u0000-\u001f\u007f]/u.test(ssid.value) || !/^[\x20-\x7e]{8,63}$/.test(password.value)) {
    event.preventDefault();
    document.getElementById('form-status').textContent = 'Revise el nombre (hasta 32 bytes) y la contraseña WPA (8–63 caracteres ASCII imprimibles).';
    return;
  }
  document.getElementById('submit').disabled = true;
  document.getElementById('form-status').textContent = 'Enviando para probar la conexión…';
});
