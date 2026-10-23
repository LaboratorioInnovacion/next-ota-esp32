export class MeasurementError extends Error {}

// Preserve MAC casing: existing station identities are case-sensitive.
export function validateMeasurement(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new MeasurementError("Se requiere un objeto JSON")
  }
  const { mac, name, temperature, humidity, lat, lon } = data
  if (typeof mac !== "string" || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)) {
    throw new MeasurementError("MAC inválida")
  }
  if (name != null && typeof name !== "string") {
    throw new MeasurementError("Nombre inválido")
  }
  if (!Number.isFinite(temperature) || temperature < -80 || temperature > 100) {
    throw new MeasurementError("Temperatura inválida (rango: -80 a 100 °C)")
  }
  if (!Number.isFinite(humidity) || humidity < 0 || humidity > 100) {
    throw new MeasurementError("Humedad inválida (rango: 0 a 100)")
  }
  const coordinates = {}
  if (Object.hasOwn(data, "lat") || Object.hasOwn(data, "lon")) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new MeasurementError("Coordenadas inválidas: se requieren lat y lon numéricos dentro de rango")
    }
    coordinates.lat = lat
    coordinates.lon = lon
  }
  return { mac, name, temperature, humidity, ...coordinates }
}

// Count actual streamed bytes, not the untrusted Content-Length header.
export async function readMeasurement(request) {
  if (!request.body) throw new MeasurementError("JSON inválido")
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2048) {
        await reader.cancel().catch(() => {})
        throw new MeasurementError("El cuerpo supera el límite de 2048 bytes")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  let data
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch {
    throw new MeasurementError("JSON inválido")
  }
  return validateMeasurement(data)
}
